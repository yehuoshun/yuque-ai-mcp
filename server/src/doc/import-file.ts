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
import { join, dirname, extname, basename } from "node:path";
import { execSync } from "node:child_process";
import type { McpTool } from "../common/types.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString, oneOf } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { ensureDirectoryPath } from "./copy-common.js";

// ─── 类型 ──────────────────────────────────────────────

type ImportMode = "direct" | "upload_assets" | "embed_assets";

interface AssetRef {
  originalPath: string;
  absolutePath: string;
  type: "image" | "attachment";
  ext: string;
  cdnUrl?: string;
  embedDocId?: number;
  embedDocSlug?: string;
  error?: string;
}

// ─── 图片上传 ──────────────────────────────────────────

async function uploadImage(
  filePath: string,
  cookie: string,
  ctoken: string,
  userId: string,
): Promise<{ ok: boolean; url: string; error?: string }> {
  try {
    const buffer = readFileSync(filePath);
    const fileName = basename(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), fileName);

    const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=image&ctoken=${ctoken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/",
        Origin: "https://www.yuque.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, url: "", error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data = await res.json() as { data?: { filekey?: string }; filekey?: string };
    const filekey = data?.data?.filekey || data?.filekey || "";
    const cdnUrl = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return { ok: !!cdnUrl, url: cdnUrl, error: cdnUrl ? undefined : "No filekey in response" };
  } catch (err) {
    return {
      ok: false,
      url: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 附件上传 ──────────────────────────────────────────

async function uploadAttachment(
  filePath: string,
  cookie: string,
  ctoken: string,
  userId: string,
): Promise<{ ok: boolean; url: string; error?: string }> {
  try {
    const buffer = readFileSync(filePath);
    const fileName = basename(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), fileName);

    const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=file&ctoken=${ctoken}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/",
        Origin: "https://www.yuque.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, url: "", error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    }

    const data = await res.json() as { data?: { filekey?: string }; filekey?: string };
    const filekey = data?.data?.filekey || data?.filekey || "";
    const cdnUrl = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return { ok: !!cdnUrl, url: cdnUrl, error: cdnUrl ? undefined : "No filekey in response" };
  } catch (err) {
    return {
      ok: false,
      url: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 附件内容解析 ──────────────────────────────────────

const EMBEDDABLE_EXTS = new Set([".docx", ".xlsx", ".pptx", ".pdf"]);

function isEmbeddable(ext: string): boolean {
  return EMBEDDABLE_EXTS.has(ext.toLowerCase());
}

/**
 * 解析附件内容为 Markdown
 * 当前简化实现：提取文本内容。后续可集成专门的解析库。
 */
function parseAttachmentContent(filePath: string, ext: string): string {
  const fileName = basename(filePath);

  // PDF: 尝试用 pdftotext
  if (ext === ".pdf") {
    try {
      const text = execSync(`pdftotext -layout "${filePath}" -`, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (text.trim()) return text.trim();
    } catch {
      // pdftotext 不可用，降级
    }
  }

  // docx: 尝试用 python-docx 或 pandoc
  if (ext === ".docx") {
    try {
      const text = execSync(`pandoc "${filePath}" -t markdown --wrap=none 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (text.trim()) return text.trim();
    } catch {
      // pandoc 不可用，降级
    }
  }

  // xlsx: 尝试用 python 解析
  if (ext === ".xlsx") {
    try {
      const script = `
import openpyxl, sys
wb = openpyxl.load_workbook("${filePath}", data_only=True)
for name in wb.sheetnames:
    ws = wb[name]
    print(f"## {name}")
    for row in ws.iter_rows(values_only=True):
        print(" | ".join(str(c) if c is not None else "" for c in row))
`;
      const text = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (text.trim()) return text.trim();
    } catch {
      // 解析失败，降级
    }
  }

  // pptx: 尝试用 python-pptx
  if (ext === ".pptx") {
    try {
      const script = `
from pptx import Presentation
prs = Presentation("${filePath}")
for i, slide in enumerate(prs.slides, 1):
    print(f"## 幻灯片 {i}")
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                text = para.text.strip()
                if text:
                    print(text)
        if shape.has_table:
            table = shape.table
            for row in table.rows:
                print(" | ".join(cell.text for cell in row.cells))
`;
      const text = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      if (text.trim()) return text.trim();
    } catch {
      // 解析失败，降级
    }
  }

  // 通用降级：pandoc
  try {
    const text = execSync(`pandoc "${filePath}" -t markdown --wrap=none 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (text.trim()) return text.trim();
  } catch {
    // 所有解析器都不可用
  }

  return `*（无法解析 ${fileName} 的内容，请手动查看附件）*`;
}

// ─── 引用提取 ──────────────────────────────────────────

/** 从 Markdown 内容中提取本地引用（图片 + 附件） */
function extractLocalRefs(md: string, baseDir: string): AssetRef[] {
  const refs: AssetRef[] = [];
  const seen = new Set<string>();

  // ![](path) 和 ![alt](path)
  const imgRegex = /!\[.*?\]\(([^)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(md)) !== null) {
    const rawPath = match[1];
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) continue;
    if (seen.has(rawPath)) continue;
    seen.add(rawPath);

    const absolutePath = rawPath.startsWith("/")
      ? rawPath
      : join(baseDir, rawPath);
    const ext = extname(rawPath).toLowerCase();

    refs.push({
      originalPath: rawPath,
      absolutePath,
      type: "image",
      ext,
    });
  }

  // [text](path) — 非图片链接，可能是附件
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = linkRegex.exec(md)) !== null) {
    const rawPath = match[2];
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) continue;
    if (rawPath.startsWith("#")) continue; // 锚点
    if (seen.has(rawPath)) continue;
    seen.add(rawPath);

    const absolutePath = rawPath.startsWith("/")
      ? rawPath
      : join(baseDir, rawPath);
    const ext = extname(rawPath).toLowerCase();

    // 判断是图片还是附件
    const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"]);
    const type = imageExts.has(ext) ? "image" : "attachment";

    refs.push({
      originalPath: rawPath,
      absolutePath,
      type,
      ext,
    });
  }

  return refs;
}

// ─── 主工具 ────────────────────────────────────────────

export const docImportFile: McpTool = {
  name: "yuque_import_file",
  description:
    "Import a local Markdown/HTML file into Yuque. Three modes: (1) direct — import as-is; " +
    "(2) upload_assets — upload local images/attachments to Yuque CDN and replace paths; " +
    "(3) embed_assets — parse attachments (docx/xlsx/pptx/pdf) into child docs, replace refs with Yuque doc links, then import.",

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
      // 不处理，原样导入
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
          const result = await uploadAttachment(ref.absolutePath, cookie, ctoken, userId);
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
        if (!existsSync(ref.absolutePath)) {
          assetResults.push({ original: ref.originalPath, type: ref.type, error: "文件不存在" });
          continue;
        }

        if (ref.type === "image") {
          // 图片不转义，保留原路径
          assetResults.push({ original: ref.originalPath, type: "image" });
          continue;
        }

        // 附件：判断是否可转义
        if (!isEmbeddable(ref.ext)) {
          assetResults.push({
            original: ref.originalPath,
            type: "attachment",
            error: `不支持转义的格式: ${ref.ext}`,
          });
          continue;
        }

        // 解析附件内容
        const content = parseAttachmentContent(ref.absolutePath, ref.ext);
        const assetTitle = basename(ref.absolutePath).replace(/\.[^.]+$/, "");

        // 创建子文档
        try {
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
            type: "attachment",
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
        // upload_assets 模式：替换为 CDN URL
        finalBody = finalBody.replaceAll(result.original, result.cdnUrl);
        assetsUploaded++;
      } else if (result.embedDocId) {
        // embed_assets 模式：替换为语雀文档链接
        const yuqueLink = `https://www.yuque.com/yehuoshun/${bookId}/${result.embedDocSlug}`;
        finalBody = finalBody.replaceAll(result.original, yuqueLink);
        assetsEmbedded++;
      } else if (result.error) {
        assetsFailed++;
        // 保留原路径
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