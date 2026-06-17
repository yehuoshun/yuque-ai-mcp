/**
 * crawler/save — 抓取 + 提取 + 写入语雀（串联工具）
 *
 * 职责：fetch → extract → 去重（KV JSON map）→ 创建语雀文档。
 * 一次调用完成「爬→取→存」全流程。
 *
 * 端点到语雀：POST /repos/{book_id}/docs（创建文档）
 * 去重：调用 kv/common.ts 的 loadKvMap / saveKvMap，不再自己创建 KV 标记文档。
 */

import { createHash } from "crypto";
import type { McpTool } from "../common/types.js";
import { isErrorResult, apiPost, apiPut } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { loadKvMap, kvIncrementalSet } from "../kv/common.js";

/** 从 RepoRef 提取知识库标识 */
function repoRefToString(ref: { id?: number; book_id?: string; namespace?: string } | undefined): string {
  if (!ref) return "";
  if (ref.id) return String(ref.id);
  if (ref.book_id) return ref.book_id;
  if (ref.namespace) return ref.namespace;
  return "";
}

/** 解析目标知识库 */
function resolveRepo(source?: string, paramRepo?: string): string {
  if (paramRepo) return paramRepo;
  const cfg = loadConfig();
  if (!cfg.crawler) return "";
  return repoRefToString(cfg.crawler?.sources?.[source || ""]);
}

/** 生成去重 slug（URL → md5 前 12 位） */
function buildSlug(url: string): string {
  return createHash("md5").update(url).digest("hex").slice(0, 12);
}

/** 从 HTML 中提取正文（仅做基础清洗，格式化交给 Agent） */
function extractContent(html: string, contentSelector?: string): { title: string; body: string } {
  // 提取标题
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // 如果指定了内容选择器，只提取该区域
  let bodyHtml = html;
  if (contentSelector) {
    const parts = contentSelector.split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      const idMatch = lastPart.match(/#([\w-]+)/);
      const tagMatch = lastPart.match(/^([\w-]+)/);
      const clsMatch = lastPart.match(/\.([\w-]+)/);
      const id = idMatch ? idMatch[1] : "";
      const tag = tagMatch ? tagMatch[1] : "\\w+";
      const cls = clsMatch ? clsMatch[1] : "";

      let tagRe: RegExp;
      if (id) {
        tagRe = new RegExp(`<(${tag})[^>]*id="${id}"[^>]*>([\\s\\S]*?)</\\1>`, "i");
      } else if (cls) {
        tagRe = new RegExp(`<(${tag})[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, "i");
      } else {
        tagRe = new RegExp(`<(${tag})[^>]*>([\\s\\S]*?)</\\1>`, "i");
      }

      const m = html.match(tagRe);
      if (m) {
        bodyHtml = m[0];
      }
    }
  }

  // 基础清洗：去 script/style/noscript，保留 HTML 原样给 Agent 处理
  const body = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  return { title, body };
}

export const crawlSave: McpTool = {
  name: "yuque_crawl_save",
  description: "Fetch URL → extract content → dedup (KV JSON map) → save to Yuque repo. One-shot pipeline. Use yuque_crawl_fetch + yuque_crawl_extract for fine-grained control. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target URL to crawl and save" },
      source: { type: "string", description: "Source key for repo routing and KV namespace, e.g. 'cnblogs'. Falls back to config crawler.sources.{source}" },
      target_repo: { type: "string", description: "Target repo ID or namespace. Optional — falls back to config.json crawler config." },
      kv_repo: { type: "string", description: "KV dedup repo ID or namespace. Optional — falls back to config.json kv.namespaces.{namespace}.book_id." },
      kv_namespace: { type: "string", description: "KV namespace for dedup. Defaults to source if set, otherwise 'crawler'." },
      content_selector: { type: "string", description: "CSS selector for content area, e.g. '.post-body', '#article-content'. Extracts full page if omitted." },
      title_selector: { type: "string", description: "CSS selector for title override, e.g. 'h1.title'. Uses <title> tag if omitted." },
      headers: { type: "string", description: "Custom request headers as JSON string" },
      timeout: { type: "number", description: "Request timeout in ms (default 15000, max 30000)" },
      title_prefix: { type: "string", description: "Optional prefix for doc title, e.g. '[博客园] '" },
      mode: { type: "string", description: "Mode: 'save' (default, save to Yuque) | 'preview' (extract only, no save)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["url"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.url, "url"));
    if (__v) return __v;

    const url = args?.url as string;
    const source = args?.source as string | undefined;
    const targetRepoParam = args?.target_repo as string | undefined;
    const kvRepoParam = args?.kv_repo as string | undefined;
    const kvNamespace = (args?.kv_namespace as string) || source || "crawler";
    const contentSelector = args?.content_selector as string | undefined;
    const titleSelector = args?.title_selector as string | undefined;
    const timeout = Math.min((args?.timeout as number) ?? 15000, 30000);
    const titlePrefix = (args?.title_prefix as string) ?? "";
    const mode = (args?.mode as string) ?? "save";

    const cfg = loadConfig();
    const targetRepo = resolveRepo(source, targetRepoParam);
    const enableKv = !!(cfg.kv?.enabled);

    // 1. 抓取
    let customHeaders: Record<string, string> = {};
    if (args?.headers && typeof args.headers === "string") {
      try { customHeaders = JSON.parse(args.headers); } catch { /* ignore */ }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const startedAt = Date.now();

    let html: string;
    let finalUrl: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; YuqueCrawler/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...customHeaders,
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      finalUrl = res.url;
      if (!res.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_FAILED",
            message: `HTTP ${res.status}`,
            url,
          }, null, 2) }],
          isError: true,
        };
      }
      html = await res.text();
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NETWORK_ERROR",
          message: `请求失败: ${message}`,
          url,
        }, null, 2) }],
        isError: true,
      };
    }

    const elapsed = Date.now() - startedAt;

    // 2. 提取
    const { title, body } = extractContent(html, contentSelector);
    const docTitle = `${titlePrefix}${title || finalUrl}`;

    // 3. 去重：加载 KV map 检查 slug
    const slug = buildSlug(finalUrl);
    let isDuplicate = false;

    if (enableKv && mode === "save") {
      try {
        const existingMap = await loadKvMap(kvNamespace);
        isDuplicate = slug in existingMap;
      } catch { /* 去重检查失败不影响主流程 */ }
    }

    // 4. preview 模式
    if (mode === "preview") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            mode: "preview",
            url: finalUrl,
            title: docTitle,
            slug,
            body_size: body.length,
            body_preview: body.substring(0, 500),
            elapsed_ms: elapsed,
            is_duplicate: isDuplicate,
          }, null, 2),
        }],
      };
    }

    // 5. 跳过重复
    if (isDuplicate) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "skipped",
            reason: "duplicate",
            url: finalUrl,
            title: docTitle,
            slug,
          }, null, 2),
        }],
      };
    }

    // 6. 写入语雀
    if (!targetRepo) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_TARGET_REPO",
          message: "未配置目标知识库，请在 config.json 中设置 crawler.sources.{source}.book_id 或传 target_repo 参数",
        }, null, 2) }],
        isError: true,
      };
    }

    const docBody = `> 来源：${finalUrl} | 抓取时间：${new Date().toISOString()}\n\n${body}`;

    const createResult = await apiPost(`/repos/${targetRepo}/docs`, {
      title: docTitle,
      body: docBody,
      slug,
      description: `原文链接: ${finalUrl}`,
      format: "html",
      public: 0,
    }, `Create doc: ${docTitle}`);

    if (isErrorResult(createResult)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          status: "failed",
          url: finalUrl,
          title: docTitle,
          error: JSON.stringify(createResult),
        }, null, 2) }],
        isError: true,
      };
    }

    const docId = (createResult as { data?: { id: number } })?.data?.id;

    // 加入目录
    if (docId) {
      try {
        await apiPut(`/repos/${targetRepo}/toc`, {
          action: "appendNode",
          action_mode: "sibling",
          type: "DOC",
          doc_ids: [docId],
        }, `Add to TOC: ${docTitle}`);
      } catch { /* TOC 失败不影响主流程 */ }
    }

    // 7. 增量写入 KV 标记
    if (enableKv) {
      try {
        await kvIncrementalSet(kvNamespace, slug, finalUrl);
      } catch { /* KV 标记失败不影响主流程 */ }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          status: "saved",
          url: finalUrl,
          title: docTitle,
          slug,
          doc_id: docId,
          target_repo: targetRepo,
          kv_namespace: kvNamespace,
          body_size: body.length,
          elapsed_ms: elapsed,
        }, null, 2),
      }],
    };
  },
};