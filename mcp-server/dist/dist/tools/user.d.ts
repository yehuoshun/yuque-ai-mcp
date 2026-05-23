/**
 * 获取当前 Token 的用户详情
 */
export declare function getUser(): Promise<string>;
/**
 * 健康检查：验证 Token 和知识库配置
 */
export declare function healthCheck(): Promise<string>;
