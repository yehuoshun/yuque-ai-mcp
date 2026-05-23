/**
 * 上传图片到语雀 CDN
 * 需要 Cookie 登录态（非 API Token），不支持时返回错误提示
 */
export declare function uploadImage(params: {
    image_path: string;
    cookie?: string;
    ctoken?: string;
}): Promise<string>;
