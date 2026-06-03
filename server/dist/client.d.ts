export interface RateLimitState {
    limit: number;
    remaining: number;
}
export declare let lastRateLimit: RateLimitState;
interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    raw?: boolean;
}
export declare function request<T = any>(path: string, opts?: RequestOptions): Promise<T>;
/** GET 请求 */
export declare function get<T = any>(path: string): Promise<T>;
/** POST 请求 */
export declare function post<T = any>(path: string, body: unknown): Promise<T>;
/** PUT 请求 */
export declare function put<T = any>(path: string, body: unknown): Promise<T>;
/** DELETE 请求 */
export declare function del<T = any>(path: string): Promise<T>;
/** GET raw=1 获取文档 markdown */
export declare function getRaw(path: string): Promise<string>;
export {};
