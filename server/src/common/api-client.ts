/**
 * api-client — 公共 HTTP 请求层
 *
 * 封装 fetch + 错误处理（含网络异常）+ 自动重试（429/5xx）+ 响应格式化，
 * 减少工具文件中的重复代码。
 * 重试策略：指数退避 1s → 2s → 4s，最多 3 次。
 */

import { loadConfig } from "./config.js";
import { handleApiError } from "./errors.js";

const cfg = loadConfig();

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** 基延迟（ms） */
const BASE_DELAY = 1000;

/** 是否应该重试：网络异常、429、5xx */
function shouldRetry(res: Response | null): boolean {
  if (!res) return true; // 网络异常
  return res.status === 429 || (res.status >= 500 && res.status < 600);
}

/** 等待 N ms */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 执行 fetch 并自动重试 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string,
  attempt = 1,
): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (shouldRetry(res) && attempt <= MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      console.error(`[RETRY] ${context} 第 ${attempt} 次失败 (${res.status})，${delay}ms 后重试`);
      await sleep(delay);
      return fetchWithRetry(url, options, context, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt <= MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, attempt - 1);
      console.error(`[RETRY] ${context} 第 ${attempt} 次网络异常，${delay}ms 后重试`);
      await sleep(delay);
      return fetchWithRetry(url, options, context, attempt + 1);
    }
    throw err;
  }
}

/** API 调用结果的类型 guard：检查是否是 MCP error */
export function isErrorResult(
  result: unknown,
): result is { content: Array<{ type: "text"; text: string }>; isError: true } {
  return typeof result === "object" && result !== null && "isError" in result && (result as any).isError === true;
}

/** 网络异常 → 结构化错误（避免未捕获异常炸到 AI 侧） */
function networkError(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: "NETWORK_ERROR",
        message: `网络请求失败 / Network request failed: ${context}`,
        detail: message,
        hint: "请检查网络连接、api_base 配置或语雀服务状态 / Check network, api_base config, or Yuque service status",
      }, null, 2),
    }],
    isError: true,
  };
}

/** 标准请求头（Token 认证） */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "X-Auth-Token": cfg.token, ...extra };
}

/** 构建完整 URL */
function buildUrl(path: string, params?: Record<string, string>): string {
  const url = `${cfg.api_base}${path}`;
  if (!params || Object.keys(params).length === 0) return url;
  const qs = new URLSearchParams(params);
  return `${url}?${qs}`;
}

/** GET 请求 */
export async function apiGet(
  path: string,
  params?: Record<string, string>,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `GET ${path}`;
  try {
    const url = buildUrl(path, params);
    const res = await fetchWithRetry(url, { headers: authHeaders() }, ctx);
    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}

/** POST 请求 */
export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `POST ${path}`;
  try {
    const url = `${cfg.api_base}${path}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }, ctx);
    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}

/** PUT 请求 */
export async function apiPut(
  path: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `PUT ${path}`;
  try {
    const url = `${cfg.api_base}${path}`;
    const res = await fetchWithRetry(url, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }, ctx);
    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}

/** DELETE 请求 */
export async function apiDelete(
  path: string,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `DELETE ${path}`;
  try {
    const url = `${cfg.api_base}${path}`;
    const res = await fetchWithRetry(url, {
      method: "DELETE",
      headers: authHeaders(),
    }, ctx);
    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}

/** POST 请求：支持 404 时 fallback 到备用路径（用于 user/group 端点自动切换） */
export async function apiPostWithFallback(
  path: string,
  fallbackPath: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `POST ${path}`;
  try {
    const cfg = loadConfig();
    let url = `${cfg.api_base}${path}`;
    let res = await fetchWithRetry(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }, ctx);

    if (res.status === 404) {
      url = `${cfg.api_base}${fallbackPath}`;
      res = await fetchWithRetry(url, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      }, ctx);
    }

    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}

/** GET 请求：支持 404 时 fallback 到备用路径 */
export async function apiGetWithFallback(
  path: string,
  fallbackPath: string,
  params?: Record<string, string>,
  context?: string,
): Promise<unknown> {
  const ctx = context ?? `GET ${path}`;
  try {
    const cfg = loadConfig();
    const qs = params && Object.keys(params).length > 0
      ? `?${new URLSearchParams(params)}`
      : "";

    let url = `${cfg.api_base}${path}${qs}`;
    let res = await fetchWithRetry(url, { headers: authHeaders() }, ctx);

    if (res.status === 404) {
      url = `${cfg.api_base}${fallbackPath}${qs}`;
      res = await fetchWithRetry(url, { headers: authHeaders() }, ctx);
    }

    if (!res.ok) return handleApiError(res, ctx);
    return res.json();
  } catch (err) {
    return networkError(ctx, err);
  }
}