import { readFileSync, statSync } from "fs";
import { loadConfig } from "../config.js";

/**
 * 上传图片到语雀 CDN
 * 需要 Cookie 登录态（非 API Token），不支持时返回错误提示
 */
export async function uploadImage(params: {
  image_path: string;
  cookie?: string;
  ctoken?: string;
}): Promise<string> {
  const config = loadConfig();
  const cookie = params.cookie || config.cookie || "";
  const ctoken = params.ctoken || config.ctoken || "";

  if (!cookie || !ctoken) {
    return JSON.stringify({
      error: "MISSING_COOKIE",
      message: "图片上传需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken 字段，获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
    });
  }

  // 检查文件
  let fileBuffer: Buffer;
  let fileName: string;
  try {
    fileBuffer = readFileSync(params.image_path);
    fileName = params.image_path.split("/").pop() || "image.png";
    const sizeMB = statSync(params.image_path).size / 1024 / 1024;
    if (sizeMB > 2) {
      return JSON.stringify({
        error: "FILE_TOO_LARGE",
        message: `图片过大 (${sizeMB.toFixed(1)}MB)，上限 2MB`,
        path: params.image_path,
      });
    }
  } catch (e: any) {
    return JSON.stringify({
      error: "FILE_NOT_FOUND",
      message: `文件不存在或无法读取: ${params.image_path}`,
      detail: e.message,
    });
  }

  // 构建 FormData
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
    const userId = "25689388"; // 从 config 读或传参
    const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=image&ctoken=${ctoken}`;

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
      return JSON.stringify({
        error: "UPLOAD_FAILED",
        status: res.status,
        message: text.slice(0, 200),
      });
    }

    const data = JSON.parse(text);
    const filekey = data?.data?.filekey || data?.filekey || "";
    const url_result = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return JSON.stringify({
      success: true,
      url: url_result,
      filekey,
    });
  } catch (e: any) {
    return JSON.stringify({
      error: "NETWORK_ERROR",
      message: e.message || String(e),
    });
  }
}