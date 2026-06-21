/**
 * doc/import-url — 从网页 URL 导入内容到语雀
 *
 * 一把梭：Agent 传 url + book_id + paths → 工具抓取 → 清洗 → 创建文档 → 挂载 TOC → 返回
 */

import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath, appendDocToToc } from "../common/toc-cache.js";
import { appendSourceLink } from "../common/copy-common.js";
import { escapeHtml } from "../common/text-utils.js";

export const docImportUrl: McpTool = {
  name: "yuque_import_url",
  description: "Import content from a web URL into Yuque. Fetches page, extracts readable content, creates doc. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      url: {
        type: "string",
        description: "Web page URL to import (required)",
      },
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"收集/技术文章\"]'. 1-5 paths (required)",
      },
      title: {
        type: "string",
        description: "Document title, defaults to page title",
      },
      format: {
        type: "string",
        description: "Content format: markdown / html, defaults to markdown",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
      },
    },
    required: ["book_id", "url", "paths"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const url = args?.url as string;
    const format = (args?.format as string) || "markdown";

    // 校验
    for (const [val, name] of [[bookId, "book_id"], [url, "url"]] as const) {
      const err = requiredString(val, name);
      if (err) return err;
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

    // ── 1. 抓取网页 ──
    let pageTitle: string;
    let pageBody: string;

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

      const html = await fetchRes.text();

      // 提取标题
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      pageTitle = titleMatch
        ? titleMatch[1].trim().replace(/\s+/g, " ")
        : new URL(url).hostname;

      // 提取正文（按 format 分支）
      pageBody = extractAndCleanContent(html, format);
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

    const title = (args?.title as string) || pageTitle;

    // ── 2. 追尾源链接（按 format 输出 markdown 或 html） ──
    const finalBody = appendSourceLinkByFormat(pageBody, url, "原文", format);

    // ── 3. 逐路径创建文档 ──
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        const dirUuid = await ensureDirectoryPath(bookId, path);
        if (!dirUuid) {
          results.push({ path, error: "目录创建失败" });
          continue;
        }

        const payload: Record<string, unknown> = { title, body: finalBody, format };
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
        const { warning } = await appendDocToToc(bookId, newDoc.id, dirUuid);
        results.push({ path, doc_id: newDoc.id, slug: newDoc.slug, ...(warning ? { warning } : {}) });
      } catch (err) {
        results.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        source_url: url,
        source_title: pageTitle,
        title,
        book_id: bookId,
        paths,
        results,
        total: results.length,
        success: results.filter((r) => r.doc_id).length,
        failed: results.filter((r) => r.error).length,
      }, null, 2) }],
    };
  },
};

// ─── 网页内容提取与清洗 ───────────────────────────────

/** 按 format 追尾源链接：markdown 用 appendSourceLink，html 用 HTML 格式 */
function appendSourceLinkByFormat(
  body: string,
  sourceUrl: string,
  sourceTitle: string,
  format: string,
): string {
  if (format === "html") {
    const footer = `<hr>\n<blockquote>📋 源文档：<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceTitle)}</a></blockquote>`;
    return body + "\n" + footer;
  }
  return appendSourceLink(body, sourceUrl, sourceTitle);
}

function extractAndCleanContent(html: string, format: string): string {
  // 1. 移除噪音标签（script/style/nav/footer/header/aside/noscript/iframe）
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 2. 优先提取 <article> 或 <main>
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) cleaned = articleMatch[1];
  else if (mainMatch) cleaned = mainMatch[1];

  // 3. format=html：保留 HTML 结构，只做噪音清理
  if (format === "html") {
    // 移除注释
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
    // 限制长度
    if (cleaned.length > 100000) {
      cleaned = cleaned.substring(0, 100000) + "\n<p>... (内容过长，已截断)</p>";
    }
    return cleaned.trim();
  }

  // 4. format=markdown：转为纯文本（保留链接并转 Markdown）
  // 4a. 保留 <a href> 转为 [text](href)
  cleaned = cleaned.replace(/<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    return cleanText ? `[${cleanText}](${href})` : "";
  });

  // 4b. 保留 <img> 转为 ![alt](src)
  cleaned = cleaned.replace(/<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![$1]($2)");
  cleaned = cleaned.replace(/<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  cleaned = cleaned.replace(/<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");

  // 4c. 块级标签 → 换行
  let text = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // 5. HTML 实体解码
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 6. 清理空白
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // 7. 合并连续空行
  text = text.replace(/\n{3,}/g, "\n\n");

  // 8. 限制长度
  if (text.length > 100000) {
    text = text.substring(0, 100000) + "\n\n... (内容过长，已截断)";
  }

  return text;
}