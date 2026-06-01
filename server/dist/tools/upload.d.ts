/**
 * 上传文件到语雀 CDN（支持图片、附件、视频）
 * 需要 Cookie 登录态（非 API Token），不支持时返回错误提示
 */
export declare function uploadAttachment(params: {
    file_path: string;
    type?: "image" | "attachment" | "video";
    cookie?: string;
    ctoken?: string;
}): Promise<string>;
