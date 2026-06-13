/**
 * copy-common — 跨知识库文档复制公共逻辑
 *
 * 职责：content 清洗、LLM 目录分类、目录缓存
 */

import { apiGet, apiPost, isErrorResult } from "../common/api-client.js";
import { loadConfig } from "../common/config.js";

// ─── Content 清洗 ─────────────────────────────────────────

/** 清洗剪藏网页的垃圾标签，保留干净结构 */
export function sanitizeContent(html: string): string {
  let cleaned = html;

  // 移除 style 标签
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // 移除 script 标签
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // 移除隐藏元素
  cleaned = cleaned.replace(/<[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  cleaned = cleaned.replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, "");

  // 移除空标签（不含文本和子元素的 div/span/p）
  cleaned = cleaned.replace(/<(div|span|p|li|td|th)\b[^>]*>\s*<\/(div|span|p|li|td|th)>/gi, "");

  // 移除多余空白
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/&nbsp;/g, " ");

  // 移除常见剪藏垃圾 class/id
  cleaned = cleaned.replace(/\s*(class|id)\s*=\s*["'][^"']*["']/gi, "");

  // 移除 data-* 属性
  cleaned = cleaned.replace(/\s*data-[a-z0-9_-]+\s*=\s*["'][^"']*["']/gi, "");

  return cleaned.trim();
}

// ─── LLM 目录分类 ────────────────────────────────────────

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function getLlmConfig(): LlmConfig | null {
  // 尝试从环境变量读取 LLM 配置
  const baseUrl = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "";
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.LLM_MODEL || "deepseek-chat";

  if (baseUrl && apiKey) {
    return { baseUrl, apiKey, model };
  }
  return null;
}

const CLASSIFY_PROMPT = `你是一个技术文档分类专家。根据文档的标题和内容，判断它应该归属到哪些技术目录路径下。

规则：
1. 每个路径用 / 分隔层级，最多 3 级，例如 "Java/Spring/SpringBoot"
2. 每个文档至少 1 条路径，最多 5 条
3. 从标题、关键词、代码块语言、技术栈推断归属
4. 只返回 JSON 数组，不要其他内容

示例输出：
["Java/Spring/SpringBoot", "Database/MySQL"]

文档信息：`;

export async function classifyDoc(
  title: string,
  content: string,
  tags: string[],
): Promise<string[]> {
  const llmConfig = getLlmConfig();
  if (!llmConfig) {
    // 无 LLM 配置，用标题关键词简单推断
    return fallbackClassify(title, content, tags);
  }

  // 截断 content，控制 token
  const contentPreview = content.replace(/<[^>]+>/g, "").substring(0, 3000);
  const tagsStr = tags.length > 0 ? `\n标签: ${tags.join(", ")}` : "";

  const prompt = `${CLASSIFY_PROMPT}
标题: ${title}${tagsStr}
内容: ${contentPreview}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return fallbackClassify(title, content, tags);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data?.choices?.[0]?.message?.content || "";
    return parseClassifyResult(text, title, content, tags);
  } catch {
    return fallbackClassify(title, content, tags);
  }
}

function parseClassifyResult(
  text: string,
  title: string,
  content: string,
  tags: string[],
): string[] {
  try {
    // 尝试提取 JSON 数组
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const paths = JSON.parse(match[0]) as string[];
      const valid = paths.filter((p) => typeof p === "string" && p.trim().length > 0);
      if (valid.length > 0) return valid.slice(0, 5);
    }
  } catch {
    // 解析失败，fallback
  }
  return fallbackClassify(title, content, tags);
}

/** 无 LLM 时的关键词分类 fallback */
function fallbackClassify(
  title: string,
  content: string,
  tags: string[],
): string[] {
  const combined = `${title} ${content.substring(0, 2000)} ${tags.join(" ")}`.toLowerCase();
  const paths: string[] = [];

  const rules: Array<{ pattern: RegExp; path: string }> = [
    { pattern: /spring\s*boot|springboot/i, path: "Java/Spring/SpringBoot" },
    { pattern: /\bspring\b/i, path: "Java/Spring" },
    { pattern: /hibernate|jpa|mybatis/i, path: "Java/ORM" },
    { pattern: /\bjava\b/i, path: "Java" },
    { pattern: /mysql|mariadb/i, path: "Database/MySQL" },
    { pattern: /redis/i, path: "Database/Redis" },
    { pattern: /mongodb|mongo/i, path: "Database/MongoDB" },
    { pattern: /postgresql|postgres/i, path: "Database/PostgreSQL" },
    { pattern: /\bsql\b/i, path: "Database" },
    { pattern: /docker/i, path: "DevOps/Docker" },
    { pattern: /kubernetes|k8s/i, path: "DevOps/Kubernetes" },
    { pattern: /linux|ubuntu|centos|debian/i, path: "DevOps/Linux" },
    { pattern: /nginx|apache/i, path: "DevOps/WebServer" },
    { pattern: /git\b|github|gitlab/i, path: "DevOps/Git" },
    { pattern: /ci\/cd|jenkins|github actions/i, path: "DevOps/CICD" },
    { pattern: /python\b|django|flask|fastapi/i, path: "Python" },
    { pattern: /javascript|js\b|node\.js|nodejs/i, path: "JavaScript/Node.js" },
    { pattern: /typescript|ts\b/i, path: "JavaScript/TypeScript" },
    { pattern: /react|vue|angular|next\.js|nuxt/i, path: "JavaScript/Frontend" },
    { pattern: /html|css|tailwind|bootstrap/i, path: "JavaScript/Frontend" },
    { pattern: /golang|go\b/i, path: "Go" },
    { pattern: /rust\b|cargo/i, path: "Rust" },
    { pattern: /c\+\+|cpp/i, path: "C++" },
    { pattern: /\bc\b|clang/i, path: "C" },
    { pattern: /kafka|rabbitmq|mq\b/i, path: "Middleware/MessageQueue" },
    { pattern: /微服务|microservice/i, path: "Architecture/Microservices" },
    { pattern: /设计模式|design pattern/i, path: "Architecture/DesignPatterns" },
    { pattern: /算法|algorithm|leetcode/i, path: "CS/Algorithm" },
    { pattern: /网络|http|tcp|dns/i, path: "CS/Network" },
    { pattern: /ai|机器学习|深度学习|machine learning|deep learning/i, path: "AI" },
    { pattern: /llm|gpt|大模型|transformer/i, path: "AI/LLM" },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(combined)) {
      paths.push(rule.path);
    }
  }

  if (paths.length === 0) {
    paths.push("未分类");
  }

  return [...new Set(paths)].slice(0, 5);
}

// ─── 目录缓存 ────────────────────────────────────────────

/** 目录路径 → 目标库文件夹文档 ID */
export interface DirCache {
  [bookId: string]: Map<string, number>;
}

const dirCache: DirCache = {};

function getCache(bookId: string): Map<string, number> {
  if (!dirCache[bookId]) {
    dirCache[bookId] = new Map();
  }
  return dirCache[bookId];
}

/**
 * 确保目录路径在目标库中存在，返回每个路径对应的文档 ID
 * 路径格式: "Java/Spring/SpringBoot"
 */
export async function ensureDirectoryPath(
  bookId: string,
  path: string,
): Promise<number | null> {
  const cache = getCache(bookId);
  if (cache.has(path)) {
    return cache.get(path)!;
  }

  const parts = path.split("/").filter(Boolean);
  let parentId: number | null = null;

  for (let i = 0; i < parts.length; i++) {
    const subPath = parts.slice(0, i + 1).join("/");
    if (cache.has(subPath)) {
      parentId = cache.get(subPath)!;
      continue;
    }

    // 在目标库创建文件夹（作为文档，无 body）
    const payload: Record<string, unknown> = {
      title: parts[i],
      body: "",
      format: "markdown",
      type: "DOC",
    };

    const data = await apiPost(`/repos/${bookId}/docs`, payload, `Create dir: ${subPath}`);
    if (isErrorResult(data)) {
      return null;
    }

    const docId = (data as { data?: { id: number } })?.data?.id;
    if (!docId) {
      return null;
    }

    parentId = docId;
    cache.set(subPath, docId);
  }

  return parentId;
}