/**
 * doc/import-file — 从本地文件导入文档到语雀（三种模式）
 *
 * 模式：
 * 1. direct       — 原样导入，不处理附件和外部图片
 * 2. upload_assets — 本地图片/附件上传到语雀 CDN，替换路径后导入
 * 3. embed_assets  — 附件（docx/xlsx/pptx/pdf）解析内容创建子文档，
 *                    替换引用为语雀文档链接后导入原文档
 *
 * 所有模式均在内存中处理，不修改源文件。
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, basename } from "node:path";
import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString, oneOf } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { ensureDirectoryPath, appendDocToToc } from "../common/toc-cache.js";
import {
  type ImportMode,
  uploadImage,
  uploadAttachmentFile,
  isEmbeddable,
  parseAttachmentContent,
  extractLocalRefs,
} from "./import-file-utils.js";

// ─── 主工具 ────────────────────────────────────────────

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
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
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
    for (const [val, name] of [[filePath, "file_path"], [bookId, "book_id"]] as const) {
      const err = requiredString(val, name);
      if (err) return err;
    }
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

    // ── 2. 提取本地引用 ──
    const baseDir = dirname(filePath);
    const refs = extractLocalRefs(body, baseDir);
    const assetResults: Array<{
      original: string;
      type: string;
      cdnUrl?: string;
      embedDocId?: number;
      embedDocSlug?: string;
      error?: string;
    }> = [];

    // ── 3. 按模式处理引用 ──

    if (mode === "direct") {
      for (const ref of refs) {
        assetResults.push({ original: ref.originalPath, type: ref.type });
      }
    }

    if (mode === "upload_assets") {
      const cookie = cfg.cookie || "";
      const ctoken = cfg.ctoken || "";
      const hasCookie = !!cookie && !!ctoken;

      if (!hasCookie) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "NO_COOKIE",
            message: "upload_assets 模式需要配置 Cookie 和 ctoken",
          }, null, 2) }],
          isError: true,
        };
      }

      // 获取 user_id
      let userId = "";
      try {
        const userRes = await fetch(`${cfg.api_base}/user`, {
          headers: { "X-Auth-Token": cfg.token },
        });
        if (userRes.ok) {
          const userData = (await userRes.json()) as { data: { id: number } };
          userId = String(userData.data.id);
        }
      } catch { /* 继续 */ }

      for (const ref of refs) {
        if (!existsSync(ref.absolutePath)) {
          assetResults.push({ original: ref.originalPath, type: ref.type, error: "文件不存在" });
          continue;
        }

        if (ref.type === "image") {
          const result = await uploadImage(ref.absolutePath, cookie, ctoken, userId);
          if (result.ok) {
            assetResults.push({ original: ref.originalPath, type: "image", cdnUrl: result.url });
          } else {
            assetResults.push({ original: ref.originalPath, type: "image", error: result.error });
          }
        } else {
          const result = await uploadAttachmentFile(ref.absolutePath, cookie, ctoken, userId);
          if (result.ok) {
            assetResults.push({ original: ref.originalPath, type: "attachment", cdnUrl: result.url });
          } else {
            assetResults.push({ original: ref.originalPath, type: "attachment", error: result.error });
          }
        }
      }
    }

    if (mode === "embed_assets") {
      for (const ref of refs) {
        try {
          if (!existsSync(ref.absolutePath)) {
            assetResults.push({ original: ref.originalPath, type: ref.type, error: "文件不存在" });
            continue;
          }

          if (ref.type === "image") {
            assetResults.push({ original: ref.originalPath, type: "image" });
            continue;
          }

          if (!isEmbeddable(ref.ext)) {
            assetResults.push({
              original: ref.originalPath,
              type: "attachment",
              error: `不支持转义的格式: ${ref.ext}`,
            });
            continue;
          }

          let content: string;
          try {
            content = parseAttachmentContent(ref.absolutePath, ref.ext);
          } catch (parseErr) {
            const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            content = `*（${basename(ref.absolutePath)} 解析异常: ${errMsg}，请手动查看附件）*`;
            assetResults.push({
              original: ref.originalPath,
              type: "attachment",
              error: `解析异常: ${errMsg}`,
            });
            continue;
          }

          const assetTitle = basename(ref.absolutePath).replace(/\.[^.]+$/, "");

          const payload: Record<string, unknown> = {
            title: assetTitle,
            body: content,
            format: "markdown",
          };
          const data = await apiPost(`/repos/${bookId}/docs`, payload, `Create embed doc: ${assetTitle}`);
          if (isErrorResult(data)) {
            assetResults.push({
              original: ref.originalPath,
              type: "attachment",
              error: "创建子文档失败",
            });
            continue;
          }

          const newDoc = (data as { data?: { id: number; slug: string } }).data;
          if (!newDoc?.id) {
            assetResults.push({
              original: ref.originalPath,
              type: "attachment",
              error: "子文档创建返回无 ID",
            });
            continue;
          }

          assetResults.push({
            original: ref.originalPath,
            type: "attachment",
            embedDocId: newDoc.id,
            embedDocSlug: newDoc.slug,
          });
        } catch (err) {
          assetResults.push({
            original: ref.originalPath,
            type: ref.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // ── 4. 替换引用（在内存中，不修改源文件） ──
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

    // ── 5. 逐路径创建文档 ──
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        const dirUuid = await ensureDirectoryPath(bookId, path);
        if (!dirUuid) {
          results.push({ path, error: "目录创建失败" });
          continue;
        }

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
