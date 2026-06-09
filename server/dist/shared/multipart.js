import { readFileSync } from "fs";
import { basename } from "path";
/**
 * 上传文件到语雀 CDN（共享 helper，upload.ts / import.ts 复用）
 *
 * @param filePath 本地文件路径
 * @param cookie 语雀 Cookie 登录态
 * @param ctoken CSRF Token（从 Cookie 中提取的 yuque_ctoken 值）
 * @param userId 语雀用户 ID
 * @param type 上传类型：image / attachment / video
 * @returns { success, url? filekey? extname? error? }
 */
export async function uploadToCdn(filePath, cookie, ctoken, userId, type = "attachment") {
    try {
        const fileBuffer = readFileSync(filePath);
        const fileName = basename(filePath);
        // 构建 multipart/form-data（Node 18+ fetch 支持手动拼，保持可控 headers）
        const boundary = "----YuqueUpload" + Date.now();
        const parts = [];
        const add = (s) => parts.push(Buffer.from(s, "utf-8"));
        add(`--${boundary}\r\n`);
        add(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
        add("Content-Type: application/octet-stream\r\n\r\n");
        parts.push(fileBuffer);
        add("\r\n");
        add(`--${boundary}--\r\n`);
        const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=${type}&ctoken=${ctoken}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Cookie: cookie,
                "x-csrf-token": ctoken,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                Referer: "https://www.yuque.com/",
                Origin: "https://www.yuque.com",
                "User-Agent": "Mozilla/5.0",
            },
            body: Buffer.concat(parts),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return { success: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        const filekey = data?.data?.filekey || data?.filekey || "";
        const extname = data?.data?.extname || "";
        const cdnUrl = filekey ? `https://cdn.nlark.com/${filekey}` : "";
        return cdnUrl
            ? { success: true, url: cdnUrl, filekey, extname }
            : { success: false, error: "No filekey in response" };
    }
    catch (e) {
        return { success: false, error: e.message || String(e) };
    }
}
//# sourceMappingURL=multipart.js.map