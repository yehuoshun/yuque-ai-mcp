/**
 * doc/import — 从本地文件导入文档到语雀
 *
 * 流程：
 *   1. 读取本地 Markdown/HTML 文件
 *   2. 解析文件中的本地图片引用
 *   3. 尝试上传图片到语雀 CDN（需要 Cookie）
 *   4. 替换图片路径为 CDN URL（上传失败保留原路径）
 *   5. 创建文档到目标知识库
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";

// ─── 图片上传（复用 upload 模块逻辑） ────────────────

async function uploadImage(
  filePath: string,
  cookie: string,
  ctoken: string,
  userId: string,
): Promise<{ ok: boolean; url: string; error?: string }> {
  try {
    const buffer = readFileSync(filePath);
    const fileName = filePath.split("/").pop() || "image";
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

// ─── 本地图片引用提取 ────────────────────────────────

interface LocalImageRef {
  originalPath: string;   // Markdown 中的原始路径
  absolutePath: string;   // 解析后的绝对路径
  cdnUrl?: string;        // 上传成功后的 CDN URL
  uploadError?: string;   // 上传失败原因
}

/** 从 Markdown 内容中提取本地图片引用 */
function extractLocalImages(md: string, baseDir: string): LocalImageRef[] {
  const refs: LocalImageRef[] = [];
  const seen = new Set<string>();

  // ![](path) 和 ![alt](path)
  const regex = /!\[.*?\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const rawPath = match[1];
    // 跳过网络 URL
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) continue;
    if (seen.has(rawPath)) continue;
    seen.add(rawPath);

    const absolutePath = rawPath.startsWith("/")
      ? rawPath
      : join(baseDir, rawPath);

    refs.push({ originalPath: rawPath, absolutePath });
  }

  // <img src="path">
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  while ((match = imgRegex.exec(md)) !== null) {
    const rawPath = match[1];
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) continue;
    if (seen.has(rawPath)) continue;
    seen.add(rawPath);

    const absolutePath = rawPath.startsWith("/")
      ? rawPath
      : join(baseDir, rawPath);

    refs.push({ originalPath: rawPath, absolutePath });
  }

  return refs;
}

// ─── 主工具 ───────────────────────────────────────────

export const docImport: McpTool = {
  name: "yuque_import_doc",
  description:
    "Import a local Markdown/HTML file into Yuque. Local images are uploaded to Yuque CDN (requires cookie). " +
    "Failed uploads fall back to original local paths.",

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
      public: {
        type: "number",
        description: "Visibility: 0=private, 1=public, 2=team-public",
      },
    },
    required: ["file_path", "book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const filePath = args?.file_path as string;
    const bookId = args?.book_id as string;
    const title = (args?.title as string) || filePath.split("/").pop()?.replace(/\.[^.]+$/, "") || "无标题";
    const slug = args?.slug as string | undefined;
    const format = (args?.format as string) || "markdown";
    const isPublic = args?.public as number | undefined;

    // ── 1. 读取文件 ──
    if (!existsSync(filePath)) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "FILE_NOT_FOUND",
            message: `文件不存在 / File not found: ${filePath}`,
          }, null, 2),
        }],
        isError: true,
      };
    }

    let body: string;
    try {
      body = readFileSync(filePath, "utf-8");
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "READ_ERROR",
            message: `无法读取文件 / Cannot read file: ${filePath}`,
            detail: err instanceof Error ? err.message : String(err),
          }, null, 2),
        }],
        isError: true,
      };
    }

    // ── 2. 解析并上传本地图片 ──
    const baseDir = dirname(filePath);
    const localImages = extractLocalImages(body, baseDir);
    const imageResults: Array<{ original: string; cdnUrl?: string; error?: string }> = [];

    const cookie = cfg.cookie || "";
    const ctoken = cfg.ctoken || "";
    const hasCookie = !!cookie && !!ctoken;

    if (localImages.length > 0 && hasCookie) {
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
      } catch { /* 获取失败继续 */ }

      for (const img of localImages) {
        if (!existsSync(img.absolutePath)) {
          imageResults.push({ original: img.originalPath, error: "File not found" });
          continue;
        }

        const result = await uploadImage(img.absolutePath, cookie, ctoken, userId);
        if (result.ok) {
          imageResults.push({ original: img.originalPath, cdnUrl: result.url });
        } else {
          imageResults.push({ original: img.originalPath, error: result.error });
        }
      }
    } else if (localImages.length > 0 && !hasCookie) {
      // 无 Cookie，跳过上传
      for (const img of localImages) {
        imageResults.push({ original: img.originalPath, error: "No cookie configured" });
      }
    }

    // ── 3. 替换图片引用 ──
    let finalBody = body;
    let imagesUploaded = 0;
    let imagesFailed = 0;

    for (const result of imageResults) {
      if (result.cdnUrl) {
        finalBody = finalBody.replaceAll(result.original, result.cdnUrl);
        imagesUploaded++;
      } else {
        imagesFailed++;
        // 保留原路径
      }
    }

    // ── 4. 创建文档 ──
    const payload: Record<string, unknown> = { title, body: finalBody, format };
    if (slug) payload.slug = slug;
    if (isPublic !== undefined) payload.public = isPublic;

    const data = await apiPost(`/repos/${bookId}/docs`, payload, "Import doc");
    if (isErrorResult(data)) return data;

    const docData = (data as { data?: { id: number; slug: string } }).data;

    const report = {
      status: "done",
      doc: { id: docData?.id, slug: docData?.slug, title },
      source_file: filePath,
      images: {
        total: localImages.length,
        uploaded: imagesUploaded,
        failed: imagesFailed,
        details: imageResults,
      },
      note: !hasCookie && localImages.length > 0
        ? "未配置 Cookie，图片未上传，保留本地路径 / Cookie not configured, images kept as local paths"
        : undefined,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
};