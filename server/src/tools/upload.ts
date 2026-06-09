import { statSync } from "fs";
import { loadConfig } from "../config.js";
import { uploadToCdn } from "../shared/multipart.js";

/**
 * 上传文件到语雀 CDN（支持图片、附件、视频）
 * 需要 Cookie 登录态（非 API Token），不支持时返回错误提示
 */
export async function uploadAttachment(params: {
  file_path: string;
  type?: "image" | "attachment" | "video";
  cookie?: string;
  ctoken?: string;
}): Promise<string> {
  const config = loadConfig();
  const cookie = params.cookie || config.cookie || "";
  const ctoken = params.ctoken || config.ctoken || "";
  const type = params.type || "attachment";

  if (!cookie || !ctoken) {
    return JSON.stringify({
      error: "MISSING_COOKIE",
      message: "文件上传需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken 字段。获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
    });
  }

  try {
    // 检查文件大小
    try {
      const sizeMB = statSync(params.file_path).size / 1024 / 1024;
      const LIMITS: Record<string, number> = { image: 20, attachment: 500, video: 500 };
      const limitMB = LIMITS[type] || 10;
      if (sizeMB > limitMB) {
        return JSON.stringify({
          error: "FILE_TOO_LARGE",
          message: `文件过大 (${sizeMB.toFixed(1)}MB)，${type} 上限 ${limitMB}MB`,
          path: params.file_path,
        });
      }
    } catch (e: any) {
      return JSON.stringify({
        error: "FILE_NOT_FOUND",
        message: `文件不存在或无法读取: ${params.file_path}`,
        detail: e.message,
      });
    }

    const userId = config.user_id;
    if (!userId) {
      return JSON.stringify({
        error: "MISSING_USER_ID",
        message: "请在 config/yuque-config.json 中配置 user_id 字段。获取方式：调用 yuque_get_user 查看 id 字段，或从浏览器 Cookie 中解析。",
      });
    }

    const result = await uploadToCdn(params.file_path, cookie, ctoken, userId, type);
    if (!result.success) {
      return JSON.stringify({
        error: "UPLOAD_FAILED",
        message: result.error || "上传失败",
      });
    }

    return JSON.stringify({
      success: true,
      url: result.url,
      filekey: result.filekey,
      extname: result.extname,
      type,
    });
  } catch (e: any) {
    return JSON.stringify({
      error: "NETWORK_ERROR",
      message: e.message || String(e),
    });
  }
}