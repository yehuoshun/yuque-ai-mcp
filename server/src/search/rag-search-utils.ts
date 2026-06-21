/**
 * search/rag-search-utils — RAG 搜索工具函数
 *
 * 从 rag-search.ts 拆分出来的工具函数：
 * - normalizeKeywords：过滤语雀分词器不支持的符号
 * - searchYuque：调语雀搜索 API（失败时返回 error 字符串而非静默吞掉）
 * - fetchDoc：获取文档完整内容（失败时返回 error 字符串而非静默吞掉）
 */

import { apiGet, isErrorResult } from "../common/api-client.js";

// ─── 关键词过滤 ──────────────────────────────────

/** 语雀分词器会切分的符号 */
const SPLIT_CHARS = /[-._]/;

/** 需要丢弃的纯符号 */
const STRIP_CHARS = /[\[\](){}<>【】「」『』""'']/g;

export function normalizeKeywords(raw: string[]): string[] {
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

export interface SearchResult {
  id: number;
  doc_id: number;
  title: string;
  summary: string;
  url: string;
  book_name: string;
  book_slug: string;
  updated_at: string;
}

export interface SearchYuqueResult {
  results: SearchResult[];
  error?: string;
}

export async function searchYuque(
  q: string,
  scope: string | undefined,
  creator: string | undefined,
): Promise<SearchYuqueResult> {
  const params: Record<string, string> = { q, type: "doc", page: "1" };
  if (scope) params.scope = scope;
  if (creator) params.creator = creator;

  const data = await apiGet("/search", params, `RAG search: ${q}`);
  if (isErrorResult(data)) {
    const errText = data.content?.[0]?.text ?? "unknown error";
    return { results: [], error: `search "${q}" failed: ${errText.substring(0, 200)}` };
  }

  const typed = data as { data?: unknown[] };
  if (!typed?.data) return { results: [] };

  return {
    results: typed.data.map((item: any) => ({
      id: item.id,
      doc_id: item.target?.id ?? item.id,
      title: item.title?.replace(/<em>|<\/em>/g, "") ?? "",
      summary: item.summary?.replace(/<em>|<\/em>/g, "") ?? "",
      url: item.url ?? "",
      book_name: item.target?.book?.name ?? "",
      book_slug: item.target?.book?.slug ?? "",
      updated_at: item.target?.content_updated_at ?? item.target?.updated_at ?? "",
    })),
  };
}

// ─── 获取文档内容 ────────────────────────────────

export interface DocContent {
  doc_id: number;
  title: string;
  body: string;
  url: string;
  book_name: string;
}

export interface FetchDocResult {
  doc: DocContent | null;
  error?: string;
}

export async function fetchDoc(
  docId: number,
): Promise<FetchDocResult> {
  const data = await apiGet(`/repos/docs/${docId}`, undefined, `RAG fetch doc: ${docId}`);
  if (isErrorResult(data)) {
    const errText = data.content?.[0]?.text ?? "unknown error";
    return { doc: null, error: `fetch doc ${docId} failed: ${errText.substring(0, 200)}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typed = data as { data?: Record<string, any> };
  const d = typed?.data;
  if (!d) return { doc: null };

  return {
    doc: {
      doc_id: docId,
      title: d.title ?? "",
      body: d.body ?? "",
      url: `https://www.yuque.com/${d.book?.namespace ?? ""}/${d.slug ?? ""}`,
      book_name: d.book?.name ?? "",
    },
  };
}