import { loadConfig } from "./config.js";
import { YuqueAPIError } from "./shared/types.js";
const BASE_URL = "https://www.yuque.com/api/v2";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
export let lastRateLimit = { limit: 0, remaining: 0 };
/** 等待 ms 毫秒 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/** 主动等限流：remaining < threshold 时 sleep 直到配额恢复 */
async function waitForRateLimit(method) {
    const threshold = method === "GET" ? 10 : 5;
    for (let i = 0; i < 10; i++) {
        if (lastRateLimit.remaining >= threshold || lastRateLimit.limit === 0)
            return;
        await sleep(1000);
    }
}
export async function request(path, opts = {}) {
    const { token } = loadConfig();
    const method = opts.method || "GET";
    const url = `${BASE_URL}${path}`;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 主动限流检查（仅重试时等待）
        if (attempt > 0) {
            await waitForRateLimit(method);
        }
        const headers = {
            "X-Auth-Token": token,
        };
        if (opts.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method,
                headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined,
                signal: controller.signal,
            });
            // 记录限流状态
            const limit = parseInt(res.headers.get("X-RateLimit-Limit") || "0");
            const remaining = parseInt(res.headers.get("X-RateLimit-Remaining") || "0");
            lastRateLimit = { limit, remaining };
            // 429 重试（1s → 2s → 3s 退避）
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get("Retry-After") || "1");
                const delay = Math.max(retryAfter, attempt + 1) * 1000;
                lastError = new YuqueAPIError(429, `Rate limited, retry in ${delay}ms`);
                if (attempt < MAX_RETRIES - 1) {
                    await sleep(delay);
                    continue;
                }
                throw lastError;
            }
            if (opts.raw) {
                return (await res.text());
            }
            const text = await res.text();
            if (!res.ok) {
                throw new YuqueAPIError(res.status, text);
            }
            try {
                return JSON.parse(text);
            }
            catch {
                return text;
            }
        }
        catch (err) {
            lastError = err;
            // 超时或网络错误也重试
            if (attempt < MAX_RETRIES - 1 && err instanceof YuqueAPIError && err.statusCode === 429) {
                continue; // 上面已经 sleep 过了，继续下一次
            }
            if (attempt < MAX_RETRIES - 1 && (err.name === "AbortError" || err.cause?.name === "AbortError")) {
                await sleep((attempt + 1) * 1000);
                continue;
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
}
/** GET 请求 */
export function get(path) {
    return request(path);
}
/** POST 请求 */
export function post(path, body) {
    return request(path, { method: "POST", body });
}
/** PUT 请求 */
export function put(path, body) {
    return request(path, { method: "PUT", body });
}
/** DELETE 请求 */
export function del(path) {
    return request(path, { method: "DELETE" });
}
/** GET raw=1 获取文档 markdown */
export function getRaw(path) {
    const sep = path.includes("?") ? "&" : "?";
    return request(`${path}${sep}raw=1`, { raw: true });
}
//# sourceMappingURL=client.js.map