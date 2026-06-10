/**
 * search/hyde-search — HyDE 降级搜索
 *
 * 流程（Agent 侧）：
 *   1. Agent 用 LLM 生成假设文档 + 关键词（HyDE）
 *   2. 调本工具，传入关键词列表
 *   3. 本工具：过滤语雀分词器不支持的符号（- . _）
 *   4. 并发调语雀搜索
 *   5. 按 doc_id 去重合并
 *
 * 端点：复用 GET /api/v2/search
 */

import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

// ─── 关键词过滤 ──────────────────────────────────

/** 语雀分词器会切分的符号 */
const SPLIT_CHARS = /[-._]/;

/** 需要丢弃的纯符号 */
const STRIP_CHARS = /[\[\](){}<>【】「」『』""'']/g;

/**
 * 将原始关键词转为语雀搜索友好的版本
 *   - 含 - . _ → 拆成空格分隔版 + 去符号拼接版
 *   - 纯符号 → 丢弃
 *   - 中文/英文/数字 → 原样保留
 */
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

// ─── Tool 定义 ────────────────────────────────────

export const searchHyde: McpTool = {
  name: "yuque_hyde_search",
  description:
    "HyDE 降级搜索：接收 Agent 生成的搜索关键词，过滤语雀分词器不支持的符号（- . _），" +
    "并发多路搜索语雀全库，按 doc_id 去重合并。关键词由 Agent 侧的 HyDE skill 生成。",
  inputSchema: {
    type: "object",
    properties: {
      keywords: {
        type: "string",
        description: "搜索关键词列表，逗号分隔。由 Agent 通过 HyDE（假设文档）策略生成，5-10 个为宜",
      },
      scope: {
        type: "string",
        description: "搜索范围，如仅搜某团队 scope=group，或搜某知识库 scope=group/book_slug。不填搜全库",
      },
      creator: { type: "string", description: "仅搜索指定作者 login" },
      max_results: {
        type: "number",
        description: "最大返回结果数（默认 30）",
      },
    },
    required: ["keywords"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const keywordsStr = args?.keywords as string;
    const scope = args?.scope as string | undefined;
    const creator = args?.creator as string | undefined;
    const maxResults = (args?.max_results as number) ?? 30;

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
            meta: { total: 0, method: "no_keywords", keywords_used: [] },
            data: [],
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

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          meta: {
            total: finalResults.length,
            method: "keyword_search",
            keywords_used: keywords,
            raw_keywords: rawKeywords,
          },
          data: finalResults,
        }, null, 2),
      }],
    };
  },
};