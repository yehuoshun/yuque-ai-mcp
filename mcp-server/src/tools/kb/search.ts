import { get } from "../../client.js";
import { loadConfig, YuqueBook } from "../../config.js";
import { SourceEntry, SubIndexPointer, SubIndexResult } from "./types.js";
import { cleanToken } from "./utils.js";
import { parseIndexDoc } from "./index.js";

/**
 * 知识库搜索 — 管道全自动（双层：路由 + 子索引库）
 */
export async function kbSearch(params: {
  tokens: string[];
  route_ns?: string;
  route_id?: number | string;
}): Promise<string> {
  const { route_book } = loadConfig();
  const tokens = params.tokens.map(cleanToken);
  const routeErrors: { token: string; reason: string }[] = [];

  let routeBooks: YuqueBook[];
  if (params.route_ns && params.route_id) {
    routeBooks = [{ book_id: params.route_id, namespace: params.route_ns }];
  } else if (route_book.length > 0) {
    routeBooks = route_book;
  } else {
    return `⚠️ 索引总库未配置。请在 config 中设置 route_book 数组，或传入 route_ns / route_id 参数。`;
  }

  const subIndexes = await findSubIndexesFromAll(tokens, routeBooks, routeErrors);

  if (subIndexes.length === 0) {
    const lines = [
      `🔍 搜索 token：${tokens.join(", ")}`,
      ...routeErrors.map(e => `- ${e.token}: ${e.reason}`),
      '',
      `未找到匹配的索引域。请尝试降级使用 yuque_search 全局搜索。`,
    ];
    if (routeErrors.length > 0) lines.splice(1, 0, `⚠️ 路由错误：`);
    return lines.join("\n");
  }

  const subResults = await Promise.all(
    subIndexes.map(si => searchOneSubIndex(tokens, si.namespace, si.book_id))
  );

  return formatSearchResults(tokens, subIndexes, subResults, routeErrors);
}

// ─── 路由定位 ──────────────────────────────────────────

/** 搜索所有总库 → 找 路由 文档 → 解析子索引库指针 */
async function findSubIndexesFromAll(
  tokens: string[],
  routeBooks: YuqueBook[],
  errors: { token: string; reason: string }[]
): Promise<SubIndexPointer[]> {
  const all = new Map<string, SubIndexPointer>();

  await Promise.all(
    routeBooks.map(async (rb) => {
      const ptrs = await findSubIndexes(tokens, rb.namespace, rb.book_id, errors);
      for (const p of ptrs) {
        if (!all.has(p.namespace)) all.set(p.namespace, p);
      }
    })
  );

  return Array.from(all.values());
}

async function findSubIndexes(
  tokens: string[],
  ns: string,
  bookId: number | string,
  errors: { token: string; reason: string }[]
): Promise<SubIndexPointer[]> {
  const seenDocs = new Map<number, string>();

  // N 路并行搜路由总库 — 用 in:title 精确匹配关键词标题
  await Promise.all(tokens.map(async (token) => {
    try {
      const q = encodeURIComponent(`${token} in:title`);
      const data = await get(`/search?q=${q}&type=doc&scope=${ns}`) as any;
      for (const r of (data.data || [])) {
        const info = r.target || r;
        const id = info.id || r.id;
        const title = info.title || r.title || "";
        if (id && !seenDocs.has(id)) {
          seenDocs.set(id, title);
        }
      }
    } catch (err: any) {
      errors.push({ token, reason: `路由搜索失败: ${err.message || err}` });
    }
  }));

  if (seenDocs.size === 0) return [];

  // 并发读路由 body → 解析 entries（新格式：关键词文档 + entries JSON）
  const pointers = new Map<string, SubIndexPointer>();
  await Promise.all(Array.from(seenDocs.keys()).map(async (docId) => {
    try {
      const data = await get(`/repos/${bookId}/docs/${docId}`) as any;
      const body: string = (data.data || data).body || "";

      // 新格式：关键词文档（entries 行包含 JSON 指针）
      const entriesMatch = body.match(/entries[：:]\s*\n?(\[.+?\])\s*$/m);
      if (entriesMatch) {
        const list: any[] = JSON.parse(entriesMatch[1]);
        for (const item of list) {
          const ns = item.namespace || item.ns;
          const bid = item.book_id || item.bid;
          if (ns && bid && !pointers.has(ns)) pointers.set(ns, { book_id: bid, namespace: ns });
        }
        return;
      }

      // 旧格式兼容：纯 JSON 数组 [{book_id, namespace}]
      try {
        const parsed = JSON.parse(body);
        const list: any[] = Array.isArray(parsed) ? parsed : (parsed.e || []);
        for (const item of list) {
          const ns = item.namespace || item.ns;
          const bid = item.book_id || item.bid;
          if (ns && bid && !pointers.has(ns)) pointers.set(ns, { book_id: bid, namespace: ns });
        }
      } catch {
        errors.push({ token: `路由 doc_${docId}`, reason: `无法解析 entries（非新格式关键词文档且非 JSON 路由）` });
      }
    } catch (err: any) {
      errors.push({ token: `路由 doc_${docId}`, reason: `解析失败: ${err.message || err}` });
    }
  }));

  return Array.from(pointers.values());
}

// ─── 单子库搜索 ────────────────────────────────────────

async function searchOneSubIndex(
  tokens: string[],
  scope: string,
  bookId: number | string
): Promise<SubIndexResult> {
  const errors: { token: string; reason: string }[] = [];

  // Step 1: N 路并行翻页搜索
  const hitsByToken = await Promise.all(tokens.map(token => fetchAllPages(token, scope, errors)));

  // Step 2: doc_id 去重
  const seen = new Map<number, { doc_id: number; title: string }>();
  for (const { hits } of hitsByToken) {
    for (const h of hits) { if (!seen.has(h.doc_id)) seen.set(h.doc_id, h); }
  }

  const indexDocs = Array.from(seen.values());
  if (indexDocs.length === 0) {
    return { entries: [], indexDocsHit: 0, sourceDocsHit: 0, dirtyBlocks: 0, errors, ns: scope };
  }

  // Step 3: 分批并发读 body（并发 5）
  const bodies = await batchReadBodies(indexDocs, bookId, errors);

  // Step 4: 解析 → 展开 entries
  const entries: SourceEntry[] = [];
  let dirtyBlocks = 0;

  for (const b of bodies) {
    const parsed = parseIndexDoc(b.body);
    if (parsed.parse_error) {
      dirtyBlocks++;
      entries.push({ did: 0, ns: "", parse_error: parsed.parse_error, sub_index_ns: scope });
      continue;
    }

    const indexKeyword = b.title?.trim();
    for (const de of parsed.entries) {
      entries.push({
        did: de.did,
        ns: de.ns,
        title: de.t,
        url: de.url || (de.ns && de.s ? `https://www.yuque.com/${de.ns}/${de.s}` : undefined),
        keywords: parsed.keywords,
        summary: indexKeyword ? `[${indexKeyword}] ${parsed.summary}` : parsed.summary,
        sub_index_ns: scope,
        weight: de.w,
      });
    }
  }

  // 按权重降序
  entries.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  return {
    entries,
    indexDocsHit: indexDocs.length,
    sourceDocsHit: entries.filter(e => !e.parse_error).length,
    dirtyBlocks,
    errors,
    ns: scope,
  };
}

// ─── 翻页搜 ────────────────────────────────────────────

async function fetchAllPages(
  token: string, scope: string, errors: { token: string; reason: string }[]
): Promise<{ token: string; hits: { doc_id: number; title: string }[] }> {
  const allHits: { doc_id: number; title: string }[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    try {
      const data = await get(
        `/search?q=${encodeURIComponent(token)}&type=doc&scope=${scope}&page=${page}`
      ) as any;
      const hits: any[] = data.data || [];
      for (const r of hits) allHits.push({ doc_id: r.id || r.doc_id, title: r.title || "" });
      hasMore = (data.meta?.total || 0) > page * 20;
      page++;
    } catch (err: any) {
      errors.push({ token, reason: err.message || String(err) });
      hasMore = false;
    }
  }

  return { token, hits: allHits };
}

// ─── 分批读 body ───────────────────────────────────────

async function batchReadBodies(
  docs: { doc_id: number; title: string }[],
  bookId: number | string,
  errors: { token: string; reason: string }[]
): Promise<{ doc_id: number; title: string; body: string }[]> {
  const CONCURRENCY = 5;
  const result: { doc_id: number; title: string; body: string }[] = [];

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const chunk = docs.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(chunk.map(async doc => {
      try {
        const data = await get(`/repos/${bookId}/docs/${doc.doc_id}`) as any;
        return { doc_id: doc.doc_id, title: doc.title, body: (data.data || data).body || "" };
      } catch (err: any) {
        errors.push({ token: 'body_read', reason: `doc_id=${doc.doc_id}: ${err.message || String(err)}` });
        return { doc_id: doc.doc_id, title: doc.title, body: "" };
      }
    }));
    result.push(...batch);
  }

  return result;
}

// ─── 格式化输出 ────────────────────────────────────────

function formatSearchResults(
  tokens: string[],
  subIndexes: SubIndexPointer[],
  results: SubIndexResult[],
  routeErrors: { token: string; reason: string }[]
): string {
  const allEntryMap = new Map<number, SourceEntry>();
  let totalIndex = 0, totalSource = 0, totalDirty = 0;
  const errors = [...routeErrors];
  const hitNS: string[] = [];

  for (const r of results) {
    if (r.indexDocsHit > 0) hitNS.push(r.ns);
    totalIndex += r.indexDocsHit;
    totalSource += r.sourceDocsHit;
    totalDirty += r.dirtyBlocks;
    errors.push(...r.errors);
    for (const e of r.entries) {
      if (!allEntryMap.has(e.did)) {
        allEntryMap.set(e.did, e);
      } else if ((e.weight ?? 0) > (allEntryMap.get(e.did)!.weight ?? 0)) {
        // 同一 did 来自多个关键词索引 → 保留权重高的
        allEntryMap.set(e.did, e);
      }
    }
  }

  const lines: string[] = [
    `🔍 搜索 token：${tokens.join(", ")}`,
    `路由命中 ${subIndexes.length} 个子索引库${hitNS.length ? `：${hitNS.join(", ")}` : ""}`,
    `命中 ${totalIndex} 个关键词索引，展开 ${totalSource} 篇源文档${totalDirty ? `，${totalDirty} 个脏块` : ""}`,
  ];

  if (errors.length > 0) {
    lines.push('', '⚠️ 错误：', ...errors.map(e => `- ${e.token}: ${e.reason}`), '');
  }

  for (const e of allEntryMap.values()) {
    if (e.parse_error) {
      lines.push(`---`, `⚠️ 脏块 (did=${e.did}, ns=${e.ns}): ${e.parse_error}`);
    } else {
      lines.push(
        `---`,
        `**${e.title || "(无标题)"}** (did=${e.did}, ns=${e.ns})` + (e.sub_index_ns ? ` [${e.sub_index_ns}]` : "") + (e.weight ? ` ⭐${e.weight}` : ""),
        ...(e.url ? [e.url] : []),
        ...(e.summary ? [`摘要：${e.summary}`] : []),
        ...(e.keywords?.length ? [`关键词：${e.keywords.join(", ")}`] : []),
        '',
      );
    }
  }

  return lines.join("\n");
}