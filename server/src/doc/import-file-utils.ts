/**
 * doc/import-file-utils — 文件导入工具函数
 *
 * 从 import-file.ts 拆分出来的通用工具函数：
 * - uploadImage / uploadAttachment：上传文件到语雀 CDN
 * - isEmbeddable / parseAttachmentContent：附件内容解析（docx/xlsx/pptx/pdf）
 * - extractLocalRefs：从 Markdown 中提取本地引用
 * - processAssets：按模式处理引用（direct/upload_assets/embed_assets）
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { execSync } from "node:child_process";
import { apiPost, apiGet, isErrorResult, fetchWithRetry } from "../common/api-client.js";

// ─── 类型 ──────────────────────────────────────────────

export type ImportMode = "direct" | "upload_assets" | "embed_assets";

export interface AssetRef {
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

export async function uploadImage(
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

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/",
        Origin: "https://www.yuque.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
    }, `Upload image: ${fileName}`);

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

export async function uploadAttachmentFile(
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

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/",
        Origin: "https://www.yuque.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
    }, `Upload attachment: ${fileName}`);

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

export function isEmbeddable(ext: string): boolean {
  return EMBEDDABLE_EXTS.has(ext.toLowerCase());
}

/**
 * 解析附件内容为 Markdown
 * 当前简化实现：提取文本内容。后续可集成专门的解析库。
 */
export function parseAttachmentContent(filePath: string, ext: string): string {
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

  // docx: 尝试用 pandoc
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
export function extractLocalRefs(md: string, baseDir: string): AssetRef[] {
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

// ─── 按模式处理引用 ──────────────────────────────────

export interface AssetResult {
  original: string;
  type: string;
  cdnUrl?: string;
  embedDocId?: number;
  embedDocSlug?: string;
  error?: string;
}

/**
 * 按模式处理所有本地引用，返回处理结果列表。
 * 从 import-file.ts handler 中抽离，保持 handler 简洁。
 */
export async function processAssets(
  mode: ImportMode,
  refs: AssetRef[],
  bookId: string,
  cfg: { cookie?: string; ctoken?: string; token: string; api_base: string },
): Promise<AssetResult[]> {
  const results: AssetResult[] = [];

  if (mode === "direct") {
    for (const ref of refs) {
      results.push({ original: ref.originalPath, type: ref.type });
    }
    return results;
  }

  if (mode === "upload_assets") {
    const cookie = cfg.cookie || "";
    const ctoken = cfg.ctoken || "";
    const hasCookie = !!cookie && !!ctoken;

    if (!hasCookie) {
      return [{ original: "", type: "error", error: "upload_assets 模式需要配置 Cookie 和 ctoken" }];
    }

    // 获取 user_id
    let userId = "";
    try {
      const userData = await apiGet("/user", undefined, "Get user for upload");
      if (!isErrorResult(userData)) {
        userId = String((userData as { data: { id: number } }).data.id);
      }
    } catch { /* 继续 */ }

    for (const ref of refs) {
      if (!existsSync(ref.absolutePath)) {
        results.push({ original: ref.originalPath, type: ref.type, error: "文件不存在" });
        continue;
      }

      if (ref.type === "image") {
        const result = await uploadImage(ref.absolutePath, cookie, ctoken, userId);
        if (result.ok) {
          results.push({ original: ref.originalPath, type: "image", cdnUrl: result.url });
        } else {
          results.push({ original: ref.originalPath, type: "image", error: result.error });
        }
      } else {
        const result = await uploadAttachmentFile(ref.absolutePath, cookie, ctoken, userId);
        if (result.ok) {
          results.push({ original: ref.originalPath, type: "attachment", cdnUrl: result.url });
        } else {
          results.push({ original: ref.originalPath, type: "attachment", error: result.error });
        }
      }
    }
    return results;
  }

  if (mode === "embed_assets") {
    for (const ref of refs) {
      try {
        if (!existsSync(ref.absolutePath)) {
          results.push({ original: ref.originalPath, type: ref.type, error: "文件不存在" });
          continue;
        }

        if (ref.type === "image") {
          results.push({ original: ref.originalPath, type: "image" });
          continue;
        }

        if (!isEmbeddable(ref.ext)) {
          results.push({
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
          results.push({
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
          results.push({
            original: ref.originalPath,
            type: "attachment",
            error: "创建子文档失败",
          });
          continue;
        }

        const newDoc = (data as { data?: { id: number; slug: string } }).data;
        if (!newDoc?.id) {
          results.push({
            original: ref.originalPath,
            type: "attachment",
            error: "子文档创建返回无 ID",
          });
          continue;
        }

        results.push({
          original: ref.originalPath,
          type: "attachment",
          embedDocId: newDoc.id,
          embedDocSlug: newDoc.slug,
        });
      } catch (err) {
        results.push({
          original: ref.originalPath,
          type: ref.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  return results;
}
