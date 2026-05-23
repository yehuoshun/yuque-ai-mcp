import { loadConfig } from "./config.js";
import { YuqueAPIError } from "./shared/types.js";
const BASE_URL = "https://www.yuque.com/api/v2";
const TIMEOUT_MS = 30_000;
export async function request(path, opts = {}) {
    const { token } = loadConfig();
    const url = `${BASE_URL}${path}`;
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
            method: opts.method || "GET",
            headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            signal: controller.signal,
        });
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
    finally {
        clearTimeout(timer);
    }
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