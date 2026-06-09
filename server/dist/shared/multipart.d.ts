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
export declare function uploadToCdn(filePath: string, cookie: string, ctoken: string, userId: string, type?: "image" | "attachment" | "video"): Promise<{
    success: boolean;
    url?: string;
    filekey?: string;
    extname?: string;
    error?: string;
}>;
