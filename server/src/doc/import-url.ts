/**
 * doc/import-url — 从网页 URL 导入内容到语雀
 *
 * 职责：Agent 传 url + book_id + paths → 工具抓取网页 → 清洗 HTML → 创建文档 → 挂载 TOC
 *
 * HTML 清洗逻辑在 common/html-cleaner.ts，本工具只做编排。
 */

import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";
import { ensureDirectoryPath, appendDocToToc } from "../common/toc-ops.js";
import { appendSourceLink } from "../common/copy-common.js";
import { extractAndCleanContent, appendSourceLinkByFormat } from "../common/html-cleaner.js";

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
    },
    required: ["book_id", "url", "paths"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const url = args?.url as string;
    const format = (args?.format as string) || "markdown";

    // 校验
    const __v = check(
      requiredString(bookId, "book_id"),
      requiredString(url, "url"),
    );
    if (__v) return __v;

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

      // 提取正文（调 common/html-cleaner）
      pageBody = extractAndCleanContent(html, format as "markdown" | "html");
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

    // ── 2. 追尾源链接 ──
    const finalBody = format === "html"
      ? appendSourceLinkByFormat(pageBody, url, "原文", format)
      : appendSourceLink(pageBody, url, "原文");

    // ── 3. 逐路径创建文档 ──
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        const dirResult = await ensureDirectoryPath(bookId, path);
        if (!dirResult.uuid) {
          results.push({ path, error: dirResult.error || "目录创建失败" });
          continue;
        }
        const dirUuid = dirResult.uuid;

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
