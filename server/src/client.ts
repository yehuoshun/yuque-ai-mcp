import { loadConfig } from "./config.js";
import { YuqueAPIError } from "./shared/types.js";

const BASE_URL = "https://www.yuque.com/api/v2";
const TIMEOUT_MS = 30_000;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  raw?: boolean;
}

export async function request<T = any>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const { token } = loadConfig();
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
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
      return (await res.text()) as T;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new YuqueAPIError(res.status, text);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text as T;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** GET 请求 */
export function get<T = any>(path: string): Promise<T> {
  return request<T>(path);
}

/** POST 请求 */
export function post<T = any>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

/** PUT 请求 */
export function put<T = any>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body });
}

/** DELETE 请求 */
export function del<T = any>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

/** GET raw=1 获取文档 markdown */
export function getRaw(path: string): Promise<string> {
  const sep = path.includes("?") ? "&" : "?";
  return request<string>(`${path}${sep}raw=1`, { raw: true });
}