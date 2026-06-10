/**
 * search/hyde-search — HyDE 降级搜索
 *
 * 流程：
 *   1. 调用外部 LLM 生成假设文档 + 搜索关键词
 *   2. 过滤语雀分词器不支持的符号（- . _）
 *   3. 用过滤后的关键词并发调语雀搜索
 *   4. 按 doc_id 去重合并结果
 *
 * 端点：复用 GET /api/v2/search
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

// ─── 关键词过滤 ──────────────────────────────────

/** 语雀分词器会切分的符号，这些符号两侧的内容会被分开索引 */
const SPLIT_CHARS = /[-._]/;

/** 需要被完全丢弃的字符模式（纯符号、括号等） */
const STRIP_CHARS = /[\[\](){}<>【】「」『』""'']/g;

/**
 * 将原始关键词转为语雀搜索友好的版本列表
 *
 * 策略：
 *   - 含 - . _ 的词 → 拆成空格分隔版 + 去除符号拼接版（两个版本都保留）
 *   - 纯符号 → 丢弃
 *   - 中文/英文单词/数字 → 原样保留
 */
function normalizeKeywords(raw: string[]): string[] {
  const result: string[] = [];

  for (const kw of raw) {
    const trimmed = kw.trim();
    if (!trimmed) continue;

    // 去掉纯符号
    const stripped = trimmed.replace(STRIP_CHARS, "").trim();
    if (!stripped) continue;

    if (SPLIT_CHARS.test(stripped)) {
      // 含切分符号：生成两个版本
      // 版本1：空格分隔（语雀会对空格分词，搜 "z fighting" = 搜 z + fighting）
      result.push(stripped.replace(SPLIT_CHARS, " "));
      // 版本2：去掉符号拼接（如 "zfighting"，可能作为完整词命中）
      result.push(stripped.replace(SPLIT_CHARS, ""));
    } else {
      result.push(stripped);
    }
  }

  // 去重，限制关键词数量防止搜索爆炸
  return [...new Set(result)].slice(0, 10);
}

// ─── HyDE Prompt ─────────────────────────────────

function buildHydePrompt(question: string): string {
  return `你是一个知识库搜索助手。用户的提问可能在现有索引中找不到答案，需要降级到全文搜索。

## 任务
根据用户提问，生成两部分内容：
1. 一段简短的"假设文档摘要"（200字以内，假设知识库中有答案，这篇文档大概会怎么写）
2. 5-10个搜索关键词

## 关键词要求
- **中文优先**，其次是英文单词
- **不要包含连字符(-)、点号(.)、下划线(_)的术语**——把它们展开成中文或空格分隔
  - 错误：z-fighting, gl.enable, depth_test
  - 正确：深度冲突 zfighting, gl开启深度测试, depth test
- 关键词应覆盖同义词、缩写展开、中英文对照
- 技术术语优先用中文表达，英文作为补充

## 输出格式
只输出以下 JSON，不要其他内容：
{
  "hypothetical_doc": "假设文档摘要...",
  "keywords": ["关键词1", "关键词2", ...]
}

## 用户提问
${question}`;
}

// ─── 语雀搜索 ────────────────────────────────────

interface SearchTarget {
  scope?: string;
  creator?: string;
}

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
  type: "doc" | "repo",
  scope: string | undefined,
  creator: string | undefined,
  cfg: ReturnType<typeof loadConfig>,
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("type", type);
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

// ─── LLM 调用 ─────────────────────────────────────

async function callLLM(prompt: string): Promise<{
  hypothetical_doc: string;
  keywords: string[];
}> {
  // 通过环境变量配置 LLM endpoint
  const llmEndpoint = process.env.HYDE_LLM_ENDPOINT || process.env.OPENAI_BASE_URL;
  const llmKey = process.env.HYDE_LLM_KEY || process.env.OPENAI_API_KEY;
  const llmModel = process.env.HYDE_LLM_MODEL || "gpt-4o-mini";

  if (!llmEndpoint || !llmKey) {
    // 无 LLM 配置时，用简单关键词提取兜底
    console.error("[hyde-search] LLM 未配置，使用基础关键词提取");
    return {
      hypothetical_doc: "",
      keywords: extractFallbackKeywords(prompt),
    };
  }

  const res = await fetch(`${llmEndpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    console.error(`[hyde-search] LLM 调用失败: ${res.status}`);
    return {
      hypothetical_doc: "",
      keywords: extractFallbackKeywords(prompt),
    };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";

  // 尝试解析 JSON
  try {
    // 去除可能的 markdown 代码块包裹
    const jsonText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonText);
    return {
      hypothetical_doc: parsed.hypothetical_doc ?? "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch {
    // JSON 解析失败，用基础提取兜底
    console.error("[hyde-search] LLM 返回非 JSON，使用基础关键词提取");
    return {
      hypothetical_doc: text.slice(0, 200),
      keywords: extractFallbackKeywords(prompt),
    };
  }
}

/** 基础关键词提取（无 LLM 时的降级） */
function extractFallbackKeywords(prompt: string): string[] {
  // 从 prompt 中提取用户提问部分
  const match = prompt.match(/## 用户提问\n(.+)$/);
  const question = match?.[1] ?? prompt;

  // 简单分词：中英文混合提取
  const tokens = question
    .split(/[\s,，。！？、]+/)
    .filter((t) => t.length >= 2 && !/^[的了吗呢吧]$/.test(t))
    .slice(0, 10);

  return tokens;
}

// ─── Tool 定义 ────────────────────────────────────

export const hydeSearch: McpTool = {
  name: "yuque_hyde_search",
  description:
    "HyDE 降级搜索：当索引搜索无结果时，通过 LLM 生成假设文档和搜索关键词，" +
    "在语雀全库范围内降级搜索。关键词会自动过滤语雀分词器不支持的符号（- . _）。" +
    "需要配置 HYDE_LLM_ENDPOINT / HYDE_LLM_KEY / HYDE_LLM_MODEL 环境变量。",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "用户原始提问（必填）" },
      scope: {
        type: "string",
        description:
          "搜索范围（≤400 字符），如仅搜某团队 scope=group，或搜某知识库 scope=group/book_slug。不填搜全库",
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

    // Step 1: HyDE 生成
    const prompt = buildHydePrompt(question);
    const { hypothetical_doc, keywords: rawKeywords } = await callLLM(prompt);

    // Step 2: 关键词过滤
    const keywords = normalizeKeywords(rawKeywords);

    // Step 3: 并发搜索
    const searchPromises = keywords.map((kw) =>
      searchYuque(kw, "doc", scope, creator, cfg),
    );
    const allResults = await Promise.all(searchPromises);

    // Step 4: 去重合并（按 doc_id）
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

    // 限制结果数
    const finalResults = merged.slice(0, maxResults);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              meta: {
                total: finalResults.length,
                hyde_doc: hypothetical_doc || null,
                keywords_used: keywords,
                raw_keywords: rawKeywords,
              },
              data: finalResults,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};