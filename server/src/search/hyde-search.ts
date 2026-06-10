/**
 * search/hyde-search — 降级搜索
 *
 * 流程：
 *   1. 从用户提问中提取关键词（本地分词，不依赖 LLM）
 *   2. 过滤语雀分词器不支持的符号（- . _）
 *   3. 用过滤后的关键词并发调语雀搜索
 *   4. 按 doc_id 去重合并结果
 *   5. 无结果时降级用原始提问直接搜
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

// ─── 本地分词 ─────────────────────────────────────

/**
 * 从用户提问中提取搜索关键词（本地分词，不依赖 LLM）
 *
 * 策略：
 *   1. 按空格/标点切分
 *   2. 过滤停用词和短词（<2 字符）
 *   3. 过滤后至少保留一部分 →
 *      成功：返回过滤后的关键词
 *      失败（所有词都被滤掉）：返回 null，降级用原始提问搜
 */
function extractKeywords(question: string): string[] | null {
  const stopWords = new Set([
    "的", "了", "吗", "呢", "吧", "是", "在", "有", "和", "与", "或",
    "这个", "那个", "怎么", "什么", "如何", "为什么", "哪个", "哪些",
    "一个", "一下", "帮我", "我要", "我想", "请问", "能不能", "可不可以",
    "a", "an", "the", "is", "are", "was", "were", "do", "does", "did",
    "how", "what", "why", "which", "when", "where", "who", "can", "could",
    "to", "in", "on", "at", "of", "for", "with", "about",
  ]);

  // 按空格、中文标点、英文标点切分
  const tokens = question
    .split(/[\s,，。！？、：；（）【】《》""''\/\\|@#$%^&*+=<>]+/)
    .filter((t) => {
      const trimmed = t.trim();
      // 长度 >= 2 且不是停用词
      return trimmed.length >= 2 && !stopWords.has(trimmed.toLowerCase());
    })
    .slice(0, 10);

  return tokens.length > 0 ? tokens : null;
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

export const hydeSearch: McpTool = {
  name: "yuque_hyde_search",
  description:
    "降级搜索：当索引搜索无结果时，从提问中提取关键词并发搜索语雀全库。" +
    "关键词自动过滤语雀分词器不支持的符号（- . _）。" +
    "分词失败时降级用原始提问直接搜。",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "用户原始提问（必填）" },
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
    required: ["q"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const question = args?.q as string;
    const scope = args?.scope as string | undefined;
    const creator = args?.creator as string | undefined;
    const maxResults = (args?.max_results as number) ?? 30;

    // Step 1: 本地分词
    const rawKeywords = extractKeywords(question);

    // Step 2: 分词失败 → 降级用原始提问直接搜
    if (!rawKeywords) {
      const fallbackResults = await searchYuque(question, scope, creator, cfg);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            meta: {
              total: fallbackResults.length,
              method: "fallback_raw_query",
              keywords_used: [question],
            },
            data: fallbackResults.slice(0, maxResults),
          }, null, 2),
        }],
      };
    }

    // Step 3: 关键词过滤（处理 - . _ 符号）
    const keywords = normalizeKeywords(rawKeywords);

    // Step 4: 并发多路搜索
    const allResults = await Promise.all(
      keywords.map((kw) => searchYuque(kw, scope, creator, cfg)),
    );

    // Step 5: 按 doc_id 去重合并
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
            method: finalResults.length > 0 ? "keyword_search" : "fallback_raw_query",
            keywords_used: keywords,
            raw_keywords: rawKeywords,
          },
          data: finalResults,
        }, null, 2),
      }],
    };
  },
};