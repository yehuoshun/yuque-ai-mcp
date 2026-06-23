/**
 * doc/import-file — 从本地文件导入文档到语雀（三种模式）
 *
 * 职责：读文件 → 提取引用 → 按模式处理 → 替换引用 → 创建文档 → 挂载 TOC
 *
 * 模式处理逻辑在 import-file-utils.ts 的 processAssets() 中。
 */

import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString, oneOf, check } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { ensureDirectoryPath, appendDocToToc } from "../common/toc-ops.js";
import {
  type ImportMode,
  extractLocalRefs,
  processAssets,
} from "./import-file-utils.js";

export const docImportFile: McpTool = {
  name: "yuque_import_file",
  description: "Import a local Markdown/HTML file into Yuque. 3 modes: direct / upload_assets / embed_assets. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Local file path (required, .md or .html)",
      },
      book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"导入/技术文档\"]'. 1-5 paths (required)",
      },
      mode: {
        type: "string",
        description: "Import mode: direct / upload_assets / embed_assets (default: direct)",
      },
      title: {
        type: "string",
        description: "Document title, defaults to filename without extension",
      },
      slug: {
        type: "string",
        description: "Document slug, auto-generated if omitted",
      },
      format: {
        type: "string",
        description: "Content format: markdown / html, defaults to markdown",
      },
    },
    required: ["file_path", "book_id", "paths"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const filePath = args?.file_path as string;
    const bookId = args?.book_id as string;
    const mode = (args?.mode as ImportMode) || "direct";
    const title = (args?.title as string) || basename(filePath).replace(/\.[^.]+$/, "") || "无标题";
    const slug = args?.slug as string | undefined;
    const format = (args?.format as string) || "markdown";

    // 校验
    const __v = check(
      requiredString(filePath, "file_path"),
      requiredString(bookId, "book_id"),
    );
    if (__v) return __v;
    const modeErr = oneOf(mode, "mode", ["direct", "upload_assets", "embed_assets"]);
    if (modeErr) return modeErr;

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

    // ── 1. 读取文件 ──
    if (!existsSync(filePath)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "FILE_NOT_FOUND",
          message: `文件不存在: ${filePath}`,
        }, null, 2) }],
        isError: true,
      };
    }

    let body: string;
    try {
      body = readFileSync(filePath, "utf-8");
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "READ_ERROR",
          message: `无法读取文件: ${filePath}`,
          detail: err instanceof Error ? err.message : String(err),
        }, null, 2) }],
        isError: true,
      };
    }

    // ── 2. 提取引用 + 按模式处理 ──
    const refs = extractLocalRefs(body, filePath);
    const assetResults = await processAssets(mode, refs, bookId, cfg);

    // 如果 processAssets 返回了错误（如 NO_COOKIE），直接返回
    if (assetResults.length === 1 && assetResults[0].type === "error") {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_COOKIE",
          message: assetResults[0].error,
        }, null, 2) }],
        isError: true,
      };
    }

    // ── 3. 替换引用 ──
    let finalBody = body;
    let assetsUploaded = 0;
    let assetsEmbedded = 0;
    let assetsFailed = 0;

    for (const result of assetResults) {
      if (result.cdnUrl) {
        finalBody = finalBody.replaceAll(result.original, result.cdnUrl);
        assetsUploaded++;
      } else if (result.embedDocId) {
        const yuqueLink = `https://www.yuque.com/yehuoshun/${bookId}/${result.embedDocSlug}`;
        finalBody = finalBody.replaceAll(result.original, yuqueLink);
        assetsEmbedded++;
      } else if (result.error) {
        assetsFailed++;
      }
    }

    // ── 4. 逐路径创建文档 ──
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
        if (slug) payload.slug = slug;

        const data = await apiPost(`/repos/${bookId}/docs`, payload, `Import file doc to ${path}`);
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

        const { warning } = await appendDocToToc(bookId, newDoc.id, dirUuid);
        results.push({ path, doc_id: newDoc.id, slug: newDoc.slug, ...(warning ? { warning } : {}) });
      } catch (err) {
        results.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        mode,
        source_file: filePath,
        title,
        book_id: bookId,
        paths,
        assets: {
          total: refs.length,
          uploaded: assetsUploaded,
          embedded: assetsEmbedded,
          failed: assetsFailed,
          details: assetResults,
        },
        results,
        total: results.length,
        success: results.filter((r) => r.doc_id).length,
        failed: results.filter((r) => r.error).length,
      }, null, 2) }],
    };
  },
};
