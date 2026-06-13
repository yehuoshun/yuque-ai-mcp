/**
 * upload/attachment — 上传文件到语雀 CDN
 *
 * 端点：POST /api/upload/attach（Web API，Cookie 认证）
 * 职责：上传图片/附件/视频到语雀 CDN，返回 CDN URL
 *
 * 上限（超级会员）：图片 50MB / 附件 2GB / 视频 2GB
 * 失败自动重试一次，再失败报错
 */

import { readFileSync, statSync } from "fs";
import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

const LIMITS: Record<string, { max: number; label: string }> = {
  image: { max: 50, label: "50MB" },
  attachment: { max: 2048, label: "2GB" },
  video: { max: 2048, label: "2GB" },
};

async function doUpload(
  filePath: string,
  fileName: string,
  fileBuffer: Buffer,
  type: string,
  userId: string,
  cookie: string,
  ctoken: string,
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuffer)]), fileName);

  const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=${type}&ctoken=${ctoken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
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

    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        result: { error: "UPLOAD_FAILED", status: res.status, message: text.slice(0, 200) },
      };
    }

    const data = JSON.parse(text) as { data?: { filekey?: string; extname?: string }; filekey?: string };
    const filekey = data?.data?.filekey || data?.filekey || "";
    const extname = data?.data?.extname || "";
    const urlResult = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return {
      ok: true,
      result: { success: true, url: urlResult, filekey, extname, type },
    };
  } finally {
    clearTimeout(timer);
  }
}

export const uploadAttachment: McpTool = {
  name: "yuque_upload_attachment",
  description:
    "Upload a file to Yuque CDN (image ≤ 50MB, attachment/video ≤ 2GB, requires cookie + ctoken)",

  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Local file path (required)" },
      type: { type: "string", description: "File type: image, attachment, video, default attachment" },
      user_id: { type: "string", description: "User ID, auto-detected from token if omitted" },
    },
    required: ["file_path"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const filePath = args?.file_path as string;
    const type = (args?.type as string) || "attachment";
    const cookie = cfg.cookie || "";
    const ctoken = cfg.ctoken || "";

    if (!cookie || !ctoken) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "MISSING_COOKIE",
                message:
                  "文件上传需要 Cookie 登录态。请在 config/config.json 中配置 cookie 和 ctoken 字段。" +
                  "获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 读取文件
    let fileBuffer: Buffer;
    let fileName: string;
    try {
      fileBuffer = readFileSync(filePath);
      fileName = filePath.split("/").pop() || "file";
      const sizeMB = statSync(filePath).size / 1024 / 1024;
      const limit = LIMITS[type] || LIMITS.attachment;
      if (sizeMB > limit.max) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "FILE_TOO_LARGE",
                  message: `${type} 文件过大 (${sizeMB.toFixed(1)}MB)，${type} 上限 ${limit.label}`,
                  path: filePath,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    } catch (e: unknown) {
      const err = e as Error;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "FILE_NOT_FOUND",
                message: `文件不存在或无法读取: ${filePath}`,
                detail: err.message,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 获取 user_id：传了直接用，没传自动获取
    let userId = (args?.user_id as string) || "";
    if (!userId) {
      try {
        const userRes = await fetch(`${cfg.api_base}/user`, {
          headers: { "X-Auth-Token": cfg.token },
        });
        if (userRes.ok) {
          const userData = (await userRes.json()) as { data: { id: number } };
          userId = String(userData.data.id);
        }
      } catch {
        // 获取失败，继续用空字符串尝试
      }
    }

    // 上传 + 失败重试一次
    let lastResult: { ok: boolean; result: Record<string, unknown> };
    for (let attempt = 0; attempt < 2; attempt++) {
      lastResult = await doUpload(filePath, fileName, fileBuffer, type, userId, cookie, ctoken);
      if (lastResult.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(lastResult.result, null, 2) }],
        };
      }
    }

    // 两次都失败
    return {
      content: [{ type: "text" as const, text: JSON.stringify(lastResult!.result, null, 2) }],
      isError: true,
    };
  },
};
