/**
 * search/rag-search — RAG 检索增强生成搜索
 *
 * 流程：
 *   1. Agent 用 LLM 生成搜索关键词
 *   2. 调本工具，传入关键词列表
 *   3. 本工具：过滤语雀分词器不支持的符号（- . _）
 *   4. 并发调语雀搜索
 *   5. 按 doc_id 去重合并
 *   6. 获取前 N 篇文档的完整内容
 *   7. 返回搜索结果 + 文档内容，由 Agent 侧 LLM 总结
 *
 * 端点：复用 GET /api/v2/search + GET /api/v2/repos/docs/:id
 */

import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

// ─── 关键词过滤 ──────────────────────────────────

/** 语雀分词器会切分的符号 */
const SPLIT_CHARS = /[-._]/;

/** 需要丢弃的纯符号 */
const STRIP_CHARS = /[\[\](){}<>【】「」『』""'']/g;

function normalizeKeywords(raw: string[]): string[] {
  const result: string[] = [];
  for (const kw of raw) {
    const trimmed = kw.trim();
    if (!trimmed) continue;

    const stripped = trimmed.replace(STRIP_CHARS, "").trim();
    if (!stripped) continue;

    if (SPLIT_CHARS.test(stripped)) {
      result.push(stripped.replace(SPLIT_CHARS, " "));
      result.push(stripped.replace(SPLIT_CHARS, ""));
    } else {
      result.push(stripped);
    }
  }
  return [...new Set(result)].slice(0, 10);
}

// ─── 语雀搜索 ────────────────────────────────────

interface SearchResult {
  id: number;
  doc_id: number;
  title: string;
  summary: string;
  url: string;
  book_name: string;
  book_slug: string;
  updated_at: string;
}

async function searchYuque(
  q: string,
  scope: string | undefined,
  creator: string | undefined,
  cfg: ReturnType<typeof loadConfig>,
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("type", "doc");
  params.set("page", "1");
  if (scope) params.set("scope", scope);
  if (creator) params.set("creator", creator);

  const url = `${cfg.api_base}/search?${params}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": cfg.token },
  });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data?.data) return [];

  return data.data.map((item: any) => ({
    id: item.id,
    doc_id: item.target?.id ?? item.id,
    title: item.title?.replace(/<em>|<\/em>/g, "") ?? "",
    summary: item.summary?.replace(/<em>|<\/em>/g, "") ?? "",
    url: item.url ?? "",
    book_name: item.target?.book?.name ?? "",
    book_slug: item.target?.book?.slug ?? "",
    updated_at: item.target?.content_updated_at ?? item.target?.updated_at ?? "",
  }));
}

// ─── 获取文档内容 ────────────────────────────────

interface DocContent {
  doc_id: number;
  title: string;
  body: string;
  url: string;
  book_name: string;
}

async function fetchDoc(
  docId: number,
  cfg: ReturnType<typeof loadConfig>,
): Promise<DocContent | null> {
  const url = `${cfg.api_base}/repos/docs/${docId}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": cfg.token },
  });

  if (!res.ok) return null;

  const data = await res.json();
  const doc = data?.data;
  if (!doc) return null;

  return {
    doc_id: docId,
    title: doc.title ?? "",
    body: doc.body ?? "",
    url: `https://www.yuque.com/${doc.book?.namespace ?? ""}/${doc.slug ?? ""}`,
    book_name: doc.book?.name ?? "",
  };
}

// ─── Tool 定义 ────────────────────────────────────

export const searchRag: McpTool = {
  name: "yuque_rag_search",
  description:
    "RAG 检索增强搜索：接收 Agent 生成的关键词，并发多路搜索语雀全库，" +
    "按 doc_id 去重合并，并获取前 N 篇文档的完整内容。" +
    "关键词由 Agent 侧 LLM 生成，文档内容由 Agent 侧 LLM 总结。",
  inputSchema: {
    type: "object",
    properties: {
      keywords: {
        type: "string",
        description: "搜索关键词列表，逗号分隔。由 Agent 通过 LLM 生成，5-10 个为宜",
      },
      scope: {
        type: "string",
        description: "搜索范围，如仅搜某团队 scope=group，或搜某知识库 scope=group/book_slug。不填搜全库",
      },
      creator: { type: "string", description: "仅搜索指定作者 login" },
      max_results: {
        type: "number",
        description: "最大搜索结果数（默认 10）",
      },
      fetch_docs: {
        type: "number",
        description: "获取前 N 篇文档的完整内容（默认 3，最大 5）",
      },
    },
    required: ["keywords"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const keywordsStr = args?.keywords as string;
    const scope = args?.scope as string | undefined;
    const creator = args?.creator as string | undefined;
    const maxResults = (args?.max_results as number) ?? 10;
    const fetchDocs = Math.min((args?.fetch_docs as number) ?? 3, 5);

    // 解析关键词
    const rawKeywords = keywordsStr
      .split(/[,，、\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (rawKeywords.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            meta: { total: 0, method: "rag_search", keywords_used: [] },
            data: [],
            docs: [],
          }, null, 2),
        }],
      };
    }

    // 过滤符号
    const keywords = normalizeKeywords(rawKeywords);

    // 并发多路搜索
    const allResults = await Promise.all(
      keywords.map((kw) => searchYuque(kw, scope, creator, cfg)),
    );

    // 按 doc_id 去重合并
    const seen = new Set<number>();
    const merged: SearchResult[] = [];
    for (const results of allResults) {
      for (const r of results) {
        if (!seen.has(r.doc_id)) {
          seen.add(r.doc_id);
          merged.push(r);
        }
      }
    }

    const finalResults = merged.slice(0, maxResults);

    // 获取前 N 篇文档的完整内容
    const docsToFetch = finalResults.slice(0, fetchDocs);
    const docs = (await Promise.all(
      docsToFetch.map((r) => fetchDoc(r.doc_id, cfg)),
    )).filter(Boolean) as DocContent[];

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          meta: {
            total: finalResults.length,
            method: "rag_search",
            keywords_used: keywords,
            raw_keywords: rawKeywords,
            docs_fetched: docs.length,
          },
          data: finalResults,
          docs,
        }, null, 2),
      }],
    };
  },
};