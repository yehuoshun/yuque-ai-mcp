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

  // N 路并行搜总库 — 语雀 v2 API 不支持 in:title，客户端过滤
  await Promise.all(routeBooks.map(async (rb) => {
    await Promise.all(tokens.map(async (token) => {
      try {
        const data = await get(`/search?q=${encodeURIComponent(token)}&type=doc&scope=${rb.namespace}`) as any;
        for (const r of (data.data || [])) {
          const info = r.target || r;
          const id = info.id || r.id;
          const title = (info.title || r.title || "").trim();
          // 客户端过滤：标题包含 token（忽略大小写），容忍 cleanToken 差异
          if (id && title.toLowerCase().includes(token.toLowerCase()) && !seenDocs.has(id)) {
            seenDocs.set(id, title);
          }
        }
      } catch (err: any) {
        errors.push({ token, reason: `路由搜索失败: ${err.message || err}` });
      }
    }));
  }));

  if (seenDocs.size === 0) {
    // 降级：搜索 API 无结果时（新文档索引延迟），逐页拉取全部文档 + 客户端标题匹配
    await Promise.all(routeBooks.map(async (rb) => {
      try {
        const allDocs = await listAllDocs(rb.book_id);
        for (const doc of allDocs) {
          const title = (doc.title || "").trim();
          if (title && tokens.some(t => title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(title.toLowerCase()))) {
            seenDocs.set(doc.id, title);
          }
        }
      } catch { /* 降级失败也不报错 */ }
    }));
  }

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
        const data = await get(`/search?q=${encodeURIComponent(token)}&type=doc&scope=${sb.namespace}`) as any;
        for (const r of (data.data || [])) {
          const info = r.target || r;
          const id = info.id || r.id;
          const title = (info.title || r.title || "").trim();
          const key = `${sb.namespace}/${id}`;
          // 客户端过滤：标题包含 token（忽略大小写），容忍 cleanToken 差异
          if (id && title.toLowerCase().includes(token.toLowerCase()) && !seenDocs.has(key)) {
            seenDocs.set(key, { did: Number(id), ns: sb.namespace });
          }
        }
      } catch (err: any) {
        errors.push({ token, reason: `子库搜索失败: ${err.message || err}` });
      }
    }));
  }));

  if (seenDocs.size === 0) {
    // 降级：搜索 API 无结果时，逐页拉取全部文档 + 客户端标题匹配
    await Promise.all(subBooks.map(async (sb) => {
      try {
        const allDocs = await listAllDocs(sb.book_id);
        for (const doc of allDocs) {
          const title = (doc.title || "").trim();
          if (title && tokens.some(t => title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(title.toLowerCase()))) {
            const key = `${sb.namespace}/${doc.id}`;
            seenDocs.set(key, { did: Number(doc.id), ns: sb.namespace });
          }
        }
      } catch { /* 降级失败也不报错 */ }
    }));
  }

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
      for (const entry of parsed.entries) {
        const existing = allEntries.get(entry.doc_id);
        if (!existing || (entry.weight ?? 0) > (existing.weight ?? 0)) {
          allEntries.set(entry.doc_id, {
            doc_id: entry.doc_id,
            namespace: entry.namespace,
            title: entry.title || entry.doc_title,
            url: entry.url || `https://www.yuque.com/${entry.namespace}/${entry.slug}`,
            keywords: entry.keywords,
            search_surface: entry.search_surface,
            summary: indexKeyword ? `[${indexKeyword}] ${entry.summary || entry.doc_title}` : (entry.summary || entry.doc_title),
            sub_index_ns: doc.ns,
            weight: entry.weight,
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
      `**${e.title || "(无标题)"}** (doc_id=${e.doc_id}, namespace=${e.namespace})` + (e.sub_index_ns ? ` [${e.sub_index_ns}]` : "") + (e.weight ? ` ⭐${e.weight}` : ""),
      ...(e.url ? [e.url] : []),
      ...(e.summary ? [`摘要：${e.summary}`] : []),
      ...(e.keywords?.length ? [`关键词：${e.keywords.join(", ")}`] : []),
      '',
    );
  }

  return lines.join("\n");
}

// ─── 分页拉取全部文档 ──────────────────────────────────

/** 逐页拉取知识库全部文档（语雀 API limit ≤ 100） */
async function listAllDocs(bookId: number | string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await get(`/repos/${bookId}/docs?offset=${offset}&limit=${limit}`) as any;
    const docs = (data.data || data) as any[];
    if (!Array.isArray(docs) || docs.length === 0) break;
    all.push(...docs);
    if (docs.length < limit) break;
    offset += limit;
  }
  return all;
}