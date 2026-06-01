/**
 * 获取当前 Token 的用户详情
 */
export declare function getUser(): Promise<string>;
/**
 * 健康检查：验证 Token 和知识库配置
 */
export declare function healthCheck(): Promise<string>;
/**
 * 获取个人写作统计仪表盘（editor_center）
 * ⚠️ Web API，需 Cookie 登录态
 */
export declare function getUserStats(): Promise<string>;
