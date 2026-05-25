import { get, post, put } from "../client.js";
import { loadConfig } from "../config.js";

// ─── 搜索 ──────────────────────────────────────────────

interface KbSearchResult {
  tokens_used: string[];
  index_docs_hit: number;
  source_entries: SourceEntry[];
  duplicates_removed: number;
}

interface SourceEntry {
  did: number;
  bid: number;
  ns: string;
  t: string;
  s?: string;
  wc?: number;
}

/**
 * 知识库搜索 — 管道全自动
 *
 * 输入：搜索 token 数组 + 子索引库信息
 * 输出：去重合并后的源文档指针列表
 *
 * 流程：
 *   tokens → N 路并行搜索子索引库 → 按 doc_id 去重
 *   → 并发读索引文档 body → 解析 entries JSON
 *   → 合并所有 entries → 按 did 去重 → 返回
 */
export async function kbSearch(params: {
  tokens: string[];
  index_book_ns: string;
  index_book_id: number | string;
}): Promise<string> {
  const { tokens, index_book_ns, index_book_id } = params;
  const scope = index_book_ns;

  // Step 1: N 路并行搜索
  const searchResults = await Promise.all(
    tokens.map(async (token) => {
      const q = encodeURIComponent(token);
      const url = `/search?q=${q}&type=doc&scope=${scope}`;
      try {
        const data = await get(url) as any;
        return {
          token,
          hits: ((data.data || data) as any[])?.map((r: any) => ({
            doc_id: r.id || r.doc_id,
            title: r.title || "",
          })) || [],
        };
      } catch {
        return { token, hits: [] };
      }
    })
  );

  // Step 2: 按 doc_id 去重（同 token 内部 + 跨 token）
  const seen = new Map<number, { doc_id: number; title: string }>();
  for (const sr of searchResults) {
    for (const hit of sr.hits) {
      if (!seen.has(hit.doc_id)) {
        seen.set(hit.doc_id, hit);
      }
    }
  }

  const uniqueIndexDocs = Array.from(seen.values());
  if (uniqueIndexDocs.length === 0) {
    return JSON.stringify({
      tokens_used: tokens,
      index_docs_hit: 0,
      source_entries: [],
      duplicates_removed: 0,
      message: "未找到相关内容",
    }, null, 2);
  }

  // Step 3: 并发读索引文档 body → 解析 entries
  const bodies = await Promise.all(
    uniqueIndexDocs.map(async (doc) => {
      try {
        const data = await get(`/repos/${index_book_id}/docs/${doc.doc_id}`) as any;
        const d = data.data || data;
        return { doc_id: doc.doc_id, title: doc.title, body: d.body || "" };
      } catch {
        return { doc_id: doc.doc_id, title: doc.title, body: "" };
      }
    })
  );

  // Step 4: 解析 entries JSON + 合并去重
  const allEntries: SourceEntry[] = [];
  const entrySeen = new Set<number>();

  for (const b of bodies) {
    const entries = parseEntries(b.body);
    for (const e of entries) {
      if (!entrySeen.has(e.did)) {
        entrySeen.add(e.did);
        allEntries.push(e);
      }
    }
  }

  const dupesRemoved =
    uniqueIndexDocs.reduce((sum, d) => {
      const entries = parseEntries(bodies.find((b) => b.doc_id === d.doc_id)?.body || "");
      return sum + entries.length;
    }, 0) - allEntries.length;

  const result: KbSearchResult = {
    tokens_used: tokens,
    index_docs_hit: uniqueIndexDocs.length,
    source_entries: allEntries,
    duplicates_removed: Math.max(0, dupesRemoved),
  };

  return JSON.stringify(result, null, 2);
}

// ─── 索引构建 ──────────────────────────────────────────

interface IndexCreateParams {
  keyword: string;
  search_surface: string;
  summary: string;
  entries: SourceEntry[];
  index_book_id: number | string;
}

/**
 * 创建单篇关键词索引文档
 *
 * 在子索引库中创建一篇 `[索引] {keyword}` 文档，
 * body 按标准三层格式组装：# 搜索面 + # 摘要 + entries JSON。
 */
export async function createIndexDoc(params: IndexCreateParams): Promise<string> {
  const { keyword, search_surface, summary, entries, index_book_id } = params;

  const body = [
    `# 搜索面`,
    search_surface,
    ``,
    `# 摘要`,
    summary,
    ``,
    JSON.stringify({ e: entries }),
  ].join("\n");

  const { default_book } = loadConfig();
  const bookId = index_book_id || default_book.book_id;
  if (!bookId) throw new Error("未指定 index_book_id 且未配置 default_book");

  const payload = {
    title: `[索引] ${keyword}`,
    body,
    format: "markdown" as const,
  };

  const data = await post(`/repos/${bookId}/docs`, payload) as any;
  const created = data.data || data;
  const docId = created.id as number;

  // 自动挂 TOC
  try {
    await put(`/repos/${bookId}/toc`, {
      action: "appendNode",
      action_mode: "child",
      target_uuid: "",
      type: "DOC",
      doc_ids: [docId],
    });
  } catch {
    // TOC 挂载失败不阻塞
  }

  return JSON.stringify({
    created: true,
    doc_id: docId,
    keyword,
    entries_count: entries.length,
    title: `[索引] ${keyword}`,
  }, null, 2);
}

// ─── helpers ──────────────────────────────────────────

/**
 * 从索引文档 body 中解析 entries JSON
 *
 * body 格式（最后一段是 JSON）：
 * # 搜索面
 * ...
 * # 摘要
 * ...
 * {"e":[{"did":...,"bid":...,...}, ...]}
 */
function parseEntries(body: string): SourceEntry[] {
  if (!body) return [];

  // 找到最后一个 {"e": 的位置
  const idx = body.lastIndexOf('{"e":');
  if (idx === -1) return [];

  // 从 {"e": 开始，用括号计数找到匹配的 }
  let depth = 0;
  let jsonStr = "";
  let started = false;
  for (let i = idx; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") {
      depth++;
      started = true;
    } else if (ch === "}") {
      depth--;
    }
    jsonStr += ch;
    if (started && depth === 0) break;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const entries = parsed.e || [];
    if (!Array.isArray(entries)) return [];
    return entries.map((e: any) => ({
      did: e.did as number,
      bid: e.bid as number,
      ns: e.ns as string,
      t: e.t || (e.title as string) || "",
      s: e.s || (e.slug as string) || "",
      wc: e.wc as number | undefined,
    }));
  } catch {
    return [];
  }
}