/**
 * doc/import-url — 从网页 URL 导入内容到语雀
 *
 * 流程：
 * 1. Agent 调用工具，传入 url + book_id + paths
 * 2. 工具 fetch URL 内容（web_fetch 风格）
 * 3. 返回原始内容给 Agent（fetch-only 模式）
 * 4. Agent 清洗内容后调手动模式（title/body/format/paths）创建文档
 *
 * 设计原因：URL 内容不可控（广告、导航、评论区等），清洗必须由 Agent 智能判断，
 * 工具只负责抓取和搬运。
 */

import type { McpTool } from "../common/types.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath, appendSourceLink } from "./copy-common.js";

export const docImportUrl: McpTool = {
  name: "yuque_import_url",
  description:
    "Import content from a web URL into Yuque. Two modes: (1) Agent provides cleaned content (title/body/format/paths) for creation; (2) Agent provides url, tool fetches the page and returns raw content for Agent to clean, then Agent calls mode 1. Mode 2 handles unpredictable web content (ads, nav, comments) that requires intelligent cleaning.",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      url: {
        type: "string",
        description: "Web page URL to import. When provided, tool fetches the page and returns raw content (title/body) for Agent to clean and create via mode 1.",
      },
      // ─── 模式 1：Agent 传入清洗后内容 ───
      title: {
        type: "string",
        description: "Document title (required for mode 1: manual content)",
      },
      body: {
        type: "string",
        description: "Document body, cleaned by Agent (required for mode 1: manual content)",
      },
      format: {
        type: "string",
        description: "Content format: markdown / html / lake, defaults to markdown",
      },
      // ─── 公共参数 ───
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"Java/Spring\",\"Database/MySQL\"]'. 1-5 paths (required)",
      },
      source_url: {
        type: "string",
        description: "Source URL, appended as footer link. In mode 2, auto-set to the imported URL.",
      },
      source_title: {
        type: "string",
        description: "Source title for the footer link. In mode 2, uses page title if not provided.",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
      },
    },
    required: ["book_id", "paths"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const url = args?.url as string | undefined;
    let title = args?.title as string | undefined;
    let body = args?.body as string | undefined;
    let format = args?.format as string | undefined;
    let sourceUrl = args?.source_url as string | undefined;
    let sourceTitle = args?.source_title as string | undefined;
    const raw = args?.raw as boolean | undefined;

    // 校验必填
    const err = requiredString(bookId, "book_id");
    if (err) return err;

    // ─── 模式 2：工具抓取 URL 内容 ───
    if (url) {
      const urlErr = requiredString(url, "url");
      if (urlErr) return urlErr;

      // 抓取网页内容
      let pageContent: { title: string; body: string; format: string };
      try {
        const fetchRes = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; YuqueMCP/1.0; +https://github.com/yehuoshun/yuque-ai-mcp)",
          },
          redirect: "follow",
        });

        if (!fetchRes.ok) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "FETCH_URL_FAILED",
              message: `抓取 URL 失败，HTTP ${fetchRes.status}`,
              url,
            }, null, 2) }],
            isError: true,
          };
        }

        const contentType = fetchRes.headers.get("content-type") || "";
        const html = await fetchRes.text();

        // 提取标题
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = titleMatch
          ? titleMatch[1].trim().replace(/\s+/g, " ")
          : new URL(url).hostname;

        // 提取正文：优先 og:description / meta description
        const ogDescMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
        const metaDescMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
        const description = ogDescMatch?.[1] || metaDescMatch?.[1] || "";

        // 尝试用 readability 风格提取正文（简化版）
        const bodyText = extractReadableContent(html);

        pageContent = {
          title: pageTitle,
          body: bodyText || description || html.substring(0, 50000),
          format: "markdown",
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_URL_ERROR",
            message: `抓取 URL 时发生网络错误: ${err instanceof Error ? err.message : String(err)}`,
            url,
          }, null, 2) }],
          isError: true,
        };
      }

      title = pageContent.title;
      body = pageContent.body;
      format = pageContent.format;

      if (!sourceUrl) sourceUrl = url;
      if (!sourceTitle) sourceTitle = pageContent.title;

      // 返回原始内容给 Agent，Agent 清洗后调手动模式创建
      // 清理控制字符
      const safeBody = body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          mode: "fetch-only",
          url,
          title,
          body: safeBody,
          format,
          source_url: sourceUrl,
          source_title: sourceTitle,
          hint: "Agent 清洗内容后，调用 yuque_import_url 手动模式（title/body/format/paths）创建文档",
        }, null, 2) }],
      };
    }

    // ─── 模式 1：Agent 传入清洗后内容，创建文档 ───
    for (const [val, name] of [[title, "title"], [body, "body"]] as const) {
      const err2 = requiredString(val as string, name);
      if (err2) return err2;
    }

    // 解析 paths
    const pathsErr = requiredString(args?.paths as string, "paths");
    if (pathsErr) return pathsErr;

    let paths: string[];
    try {
      paths = JSON.parse(args?.paths as string) as string[];
      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_PATHS", message: "paths 必须是非空 JSON 数组" }, null, 2) }],
          isError: true,
        };
      }
      paths = paths.slice(0, 5);
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_PATHS", message: "paths 必须是有效的 JSON 数组" }, null, 2) }],
        isError: true,
      };
    }

    if (!title || !body) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "MISSING_CONTENT",
          message: "manual 模式缺少 title/body 参数",
        }, null, 2) }],
        isError: true,
      };
    }

    const finalFormat = format || "markdown";

    // 追尾源链接
    let finalBody = body;
    if (sourceUrl) {
      finalBody = appendSourceLink(finalBody, sourceUrl, sourceTitle || "原文");
    }

    // 逐路径创建副本
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        const dirUuid = await ensureDirectoryPath(bookId, path);
        if (!dirUuid) {
          results.push({ path, error: "目录创建失败" });
          continue;
        }

        const payload: Record<string, unknown> = { title, body: finalBody, format: finalFormat };
        const data = await apiPost(`/repos/${bookId}/docs`, payload, `Import URL doc to ${path}`);
        if (isErrorResult(data)) {
          const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
          results.push({ path, error: errMsg });
          continue;
        }

        const newDoc = (data as { data?: { id: number; slug: string } }).data;
        if (!newDoc?.id) {
          results.push({ path, error: "文档创建返回无 ID" });
          continue;
        }

        // 挂到目录节点下
        await apiPut(`/repos/${bookId}/toc`, {
          action: "appendNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: [newDoc.id],
          target_uuid: dirUuid,
        }, `Append doc to TOC: ${path}`);

        results.push({ path, doc_id: newDoc.id, slug: newDoc.slug });
      } catch (err) {
        results.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const summary = {
      mode: url ? "auto-fetch" : "manual",
      source_url: sourceUrl || url || null,
      title,
      book_id: bookId,
      paths,
      results,
      total: results.length,
      success: results.filter((r) => r.doc_id).length,
      failed: results.filter((r) => r.error).length,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};

// ─── 网页正文提取（简化版 readability） ──────────────────

function extractReadableContent(html: string): string {
  // 移除 script / style / nav / footer / header 标签
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 尝试找 <article> 或 <main> 标签
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) cleaned = articleMatch[1];
  else if (mainMatch) cleaned = mainMatch[1];

  // 移除所有 HTML 标签，保留文本
  let text = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // 解码 HTML 实体
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 清理多余空白
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // 限制长度（避免超大页面）
  if (text.length > 100000) {
    text = text.substring(0, 100000) + "\n\n... (内容过长，已截断)";
  }

  return text;
}
