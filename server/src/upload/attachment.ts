/**
 * upload/attachment — 上传文件到语雀 CDN
 *
 * 端点：POST /api/upload/attach（Web API，Cookie 认证）
 * 职责：上传图片/附件/视频到语雀 CDN，返回 CDN URL
 *
 * 上限：10MB
 */

import { readFileSync, statSync } from "fs";
import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

export const uploadAttachment: McpTool = {
  name: "yuque_upload_attachment",
  description: "上传文件到语雀 CDN（图片上限 20MB，附件/视频上限 500MB，需要 config.json 中配置 cookie + ctoken）",

  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "本地文件路径（必填）" },
      type: { type: "string", description: "文件类型：image / attachment / video，默认 attachment" },
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

    // 检查文件（上限按专业会员：图片20M/附件500M/视频500M）
    let fileBuffer: Buffer;
    let fileName: string;
    try {
      fileBuffer = readFileSync(filePath);
      fileName = filePath.split("/").pop() || "file";
      const sizeMB = statSync(filePath).size / 1024 / 1024;
      const limits: Record<string, { max: number; label: string }> = {
        image: { max: 20, label: "20MB" },
        attachment: { max: 500, label: "500MB" },
        video: { max: 500, label: "500MB" },
      };
      const limit = limits[type] || limits.attachment;
      if (sizeMB > limit.max) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "FILE_TOO_LARGE",
              message: `${type} 文件过大 (${sizeMB.toFixed(1)}MB)，${type} 上限 ${limit.label}`,
              path: filePath,
            }, null, 2),
          }],
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

    // 构建 multipart FormData
    const boundary = "----YuqueUpload" + Date.now();
    const parts: Buffer[] = [];
    const add = (s: string) => parts.push(Buffer.from(s, "utf-8"));

    add(`--${boundary}\r\n`);
    add(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
    add("Content-Type: application/octet-stream\r\n\r\n");
    parts.push(fileBuffer);
    add("\r\n");
    add(`--${boundary}--\r\n`);

    const body = Buffer.concat(parts);

    try {
      // 获取用户 ID（从 user API）
      let userId = "0";
      try {
        const userRes = await fetch(`${cfg.api_base}/user`, {
          headers: { "X-Auth-Token": cfg.token },
        });
        if (userRes.ok) {
          const userData = (await userRes.json()) as { data: { id: number } };
          userId = String(userData.data.id);
        }
      } catch {
        // 获取用户 ID 失败，使用默认值
      }

      const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=${type}&ctoken=${ctoken}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Cookie": cookie,
          "x-csrf-token": ctoken,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Referer": "https://www.yuque.com/",
          "Origin": "https://www.yuque.com",
          "User-Agent": "Mozilla/5.0",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const text = await res.text();
      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: "UPLOAD_FAILED", status: res.status, message: text.slice(0, 200) },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const data = JSON.parse(text) as { data?: { filekey?: string; extname?: string }; filekey?: string };
      const filekey = data?.data?.filekey || data?.filekey || "";
      const extname = data?.data?.extname || "";
      const urlResult = filekey ? `https://cdn.nlark.com/${filekey}` : "";

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, url: urlResult, filekey, extname, type },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e: unknown) {
      const err = e as Error;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { error: "NETWORK_ERROR", message: err.message || String(err) },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  },
};