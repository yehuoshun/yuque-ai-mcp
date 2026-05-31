import { get } from "../../client.js";
import { loadConfig, YuqueBook } from "../../config.js";
import { SourceEntry, RouteEntry } from "./types.js";
import { cleanToken } from "./utils.js";
import { parseIndexDoc } from "./index.js";

/**
 * 知识库搜索 — 双层路由：总库关键词路由 → 子库关键词索引
 *
 * 1. tokens in:title 搜总库 → 找到关键词路由文档
 * 2. 路由文档 body 为 source_books 数组 [{book_id, namespace, last_built?}]
 * 3. tokens in:title 搜子库 → 找到关键词索引文档
 * 4. 读取索引文档 → parseIndexDoc 展开 → 返回源文档指针
 */
export async function kbSearch(params: {
  tokens: string[];
  route_ns?: string;
  route_id?: number | string;
}): Promise<string> {
  const { route_book, route_book_sub } = loadConfig();
  const tokens = params.tokens.map(cleanToken);
  const routeErrors: { token: string; reason: string }[] = [];

  let routeBooks: YuqueBook[];
  if (params.route_ns && params.route_id) {
    routeBooks = [{ book_id: params.route_id, namespace: params.route_ns }];
  } else if (route_book.length > 0) {
    routeBooks = route_book;
  } else {
    return [
      "⚠️ 索引总库未配置。",
      "",
      "索引搜索需要 route_book（索引总库）做路由层。请执行：",
      "1. yuque_create_repo → 创建总库（如 route-book）",
      "2. yuque_config_update → 追加 route_book",
      "",
      "或通知 Agent 代为创建。",
      "",
      "降级方案：传 route_ns + route_id 参数直接指定总库。",
    ].join("\n");
  }

  if (route_book_sub.length === 0) {
    return [
      "⚠️ 子索引库未配置。",
      "",
      "索引搜索需要 route_book_sub（子索引库）存关键词索引文档。请执行：",
      "1. yuque_create_repo → 创建子索引库",
      "2. yuque_config_update → 追加 route_book_sub",
      "",
      "或通知 Agent 代为创建。",
    ].join("\n");
  }

  // Step 1: 搜索总库 → 找关键词路由文档，确认 keyword 已索引
  const sourceBooks = await findRouteDocs(tokens, routeBooks, routeErrors);

  if (sourceBooks.length === 0) {
    const lines = [
      `🔍 搜索 token：${tokens.join(", ")}`,
      ...routeErrors.map(e => `- ${e.token}: ${e.reason}`),
      '',
      `未找到匹配的索引域。请尝试降级使用 yuque_search 全局搜索。`,
    ];
    if (routeErrors.length > 0) lines.splice(1, 0, `⚠️ 路由错误：`);
    return lines.join("\n");
  }

  // Step 2: 搜索子库 → 找关键词索引文档
  const subIndexDocs = await searchSubIndexForTokens(tokens, route_book_sub, routeErrors);

  if (subIndexDocs.length === 0) {
    return [
      `🔍 搜索 token：${tokens.join(", ")}`,
      ...routeErrors.map(e => `- ${e.token}: ${e.reason}`),
      '',
      `总库路由命中但子库未找到索引文档。请确认子库已构建关键词索引。`,
    ].join("\n");
  }

  // Step 3: 读取子库索引文档 → 展开源文档 entries
  const { entries, dirtyBlocks, errors } = await readIndexDocs(subIndexDocs);

  return formatSearchResults(tokens, subIndexDocs, entries, dirtyBlocks, routeErrors, errors, sourceBooks);
}

// ─── 路由定位 ──────────────────────────────────────────

/** 搜索总库 → 解析路由文档 body → 返回 source_books */
async function findRouteDocs(
  tokens: string[],
  routeBooks: YuqueBook[],
  errors: { token: string; reason: string }[]
): Promise<{ book_id: number | string; namespace: string; last_built?: string }[]> {
  const seenDocs = new Map<number, string>();

  // N 路并行搜总库 — in:title 精确匹配
  await Promise.all(routeBooks.map(async (rb) => {
    await Promise.all(tokens.map(async (token) => {
      try {
        const q = encodeURIComponent(`${token} in:title`);
        const data = await get(`/search?q=${q}&type=doc&scope=${rb.namespace}`) as any;
        for (const r of (data.data || [])) {
          const info = r.target || r;
          const id = info.id || r.id;
          const title = info.title || r.title || "";
          if (id && !seenDocs.has(id)) seenDocs.set(id, title);
        }
      } catch (err: any) {
        errors.push({ token, reason: `路由搜索失败: ${err.message || err}` });
      }
    }));
  }));

  if (seenDocs.size === 0) return [];

  // 并发读总库文档 body → 解析 source_books
  const allSourceBooks: { book_id: number | string; namespace: string; last_built?: string }[] = [];
  const seenSourceBooks = new Set<string>();

  await Promise.all(
    routeBooks.map(async (rb) => {
      await Promise.all(Array.from(seenDocs.keys()).map(async (docId) => {
        try {
          const data = await get(`/repos/${rb.book_id}/docs/${docId}`) as any;
          const body: string = (data.data || data).body || "";

          // 路由文档 body — 格式：[{book_id, namespace, last_built?}]
          let list: any[] = [];
          try {
            const parsed = JSON.parse(body);
            list = Array.isArray(parsed) ? parsed : [];
          } catch {
            // body 不是合法 JSON
          }

          if (list.length === 0) {
            errors.push({ token: `路由 doc_${docId}`, reason: `无法解析 source_books` });
            return;
          }

          for (const item of list) {
            const key = `${item.book_id}/${item.namespace}`;
            if (item.book_id && item.namespace && !seenSourceBooks.has(key)) {
              seenSourceBooks.add(key);
              allSourceBooks.push({
                book_id: item.book_id,
                namespace: item.namespace,
                last_built: item.last_built,
              });
            }
          }
        } catch (err: any) {
          errors.push({ token: `路由 doc_${docId}`, reason: `解析失败: ${err.message || err}` });
        }
      }));
    })
  );

  return allSourceBooks;
}

// ─── 搜索子库索引文档 ──────────────────────────────────

/** 用 tokens 搜索子库 → 返回匹配的索引文档 {did, ns} */
async function searchSubIndexForTokens(
  tokens: string[],
  subBooks: YuqueBook[],
  errors: { token: string; reason: string }[]
): Promise<RouteEntry[]> {
  const seenDocs = new Map<string, { did: number; ns: string }>();

  await Promise.all(subBooks.map(async (sb) => {
    await Promise.all(tokens.map(async (token) => {
      try {
        const q = encodeURIComponent(`${token} in:title`);
        const data = await get(`/search?q=${q}&type=doc&scope=${sb.namespace}`) as any;
        for (const r of (data.data || [])) {
          const info = r.target || r;
          const id = info.id || r.id;
          const key = `${sb.namespace}/${id}`;
          if (id && !seenDocs.has(key)) {
            seenDocs.set(key, { did: Number(id), ns: sb.namespace });
          }
        }
      } catch (err: any) {
        errors.push({ token, reason: `子库搜索失败: ${err.message || err}` });
      }
    }));
  }));

  return Array.from(seenDocs.values());
}

// ─── 读取子库索引文档 ──────────────────────────────────

/** 直接按 did/ns 读取子库索引文档，展开源文档指针 */
async function readIndexDocs(
  routeEntries: RouteEntry[]
): Promise<{ entries: SourceEntry[]; dirtyBlocks: number; errors: { token: string; reason: string }[] }> {
  const errors: { token: string; reason: string }[] = [];
  const allEntries: Map<number, SourceEntry> = new Map();
  let dirtyBlocks = 0;

  const config = loadConfig();
  const CONCURRENCY = config.search_concurrency || 5;
  const deduped = dedupByDidNs(routeEntries);

  // 分批并发读索引文档
  for (let i = 0; i < deduped.length; i += CONCURRENCY) {
    const chunk = deduped.slice(i, i + CONCURRENCY);

    const results = await Promise.all(chunk.map(async (re) => {
      try {
        const data = await get(`/repos/${re.ns}/docs/${re.did}`) as any;
        return {
          did: re.did,
          ns: re.ns,
          title: (data.data || data).title || "",
          body: (data.data || data).body || "",
        };
      } catch (err: any) {
        errors.push({ token: 'body_read', reason: `did=${re.did}, ns=${re.ns}: ${err.message || String(err)}` });
        return { did: re.did, ns: re.ns, title: "", body: "" };
      }
    }));

    for (const doc of results) {
      if (!doc.body) continue;

      const parsed = parseIndexDoc(doc.body);
      if (parsed.parse_error) {
        dirtyBlocks++;
        continue;
      }

      const indexKeyword = doc.title?.trim();
      for (const de of parsed.entries) {
        const existing = allEntries.get(de.did);
        if (!existing || (de.w ?? 0) > (existing.weight ?? 0)) {
          allEntries.set(de.did, {
            did: de.did,
            ns: de.ns,
            title: de.t,
            url: de.url || `https://www.yuque.com/${de.ns}/${de.s}`,
            keywords: parsed.keywords,
            summary: indexKeyword ? `[${indexKeyword}] ${parsed.summary}` : parsed.summary,
            sub_index_ns: doc.ns,
            weight: de.w,
          });
        }
      }
    }
  }

  return { entries: Array.from(allEntries.values()), dirtyBlocks, errors };
}

function dedupByDidNs(entries: RouteEntry[]): RouteEntry[] {
  const seen = new Set<string>();
  const result: RouteEntry[] = [];
  for (const e of entries) {
    const key = `${e.ns}/${e.did}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

// ─── 格式化输出 ────────────────────────────────────────

function formatSearchResults(
  tokens: string[],
  routeEntries: RouteEntry[],
  entries: SourceEntry[],
  dirtyBlocks: number,
  routeErrors: { token: string; reason: string }[],
  readErrors: { token: string; reason: string }[],
  _sourceBooks: { book_id: number | string; namespace: string; last_built?: string }[]
): string {
  const errors = [...routeErrors, ...readErrors];
  const hitNS = [...new Set(entries.map(e => e.sub_index_ns).filter(Boolean))];

  const lines: string[] = [
    `🔍 搜索 token：${tokens.join(", ")}`,
    `路由命中 ${routeEntries.length} 个索引文档${hitNS.length ? `，分布子库：${hitNS.join(", ")}` : ""}`,
    `展开 ${entries.length} 篇源文档${dirtyBlocks ? `，${dirtyBlocks} 个脏块` : ""}`,
  ];

  if (errors.length > 0) {
    lines.push('', '⚠️ 错误：', ...errors.map(e => `- ${e.token}: ${e.reason}`), '');
  }

  // 按权重降序
  const sorted = [...entries].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  for (const e of sorted) {
    lines.push(
      `---`,
      `**${e.title || "(无标题)"}** (did=${e.did}, ns=${e.ns})` + (e.sub_index_ns ? ` [${e.sub_index_ns}]` : "") + (e.weight ? ` ⭐${e.weight}` : ""),
      ...(e.url ? [e.url] : []),
      ...(e.summary ? [`摘要：${e.summary}`] : []),
      ...(e.keywords?.length ? [`关键词：${e.keywords.join(", ")}`] : []),
      '',
    );
  }

  return lines.join("\n");
}