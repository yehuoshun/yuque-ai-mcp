/**
 * api-client — 公共 HTTP 请求层
 *
 * 封装 fetch + 错误处理 + 响应格式化，减少工具文件中的重复代码。
 */

import { loadConfig } from "./config.js";
import { handleApiError } from "./errors.js";

const cfg = loadConfig();

/** API 调用结果的类型 guard：检查是否是 MCP error */
export function isErrorResult(
  result: unknown,
): result is { content: Array<{ type: "text"; text: string }>; isError: true } {
  return typeof result === "object" && result !== null && "isError" in result && (result as any).isError === true;
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
  const url = buildUrl(path, params);
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) return handleApiError(res, context ?? `GET ${path}`);
  return res.json();
}

/** POST 请求 */
export async function apiPost(
  path: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const url = `${cfg.api_base}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return handleApiError(res, context ?? `POST ${path}`);
  return res.json();
}

/** PUT 请求 */
export async function apiPut(
  path: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const url = `${cfg.api_base}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return handleApiError(res, context ?? `PUT ${path}`);
  return res.json();
}

/** DELETE 请求 */
export async function apiDelete(
  path: string,
  context?: string,
): Promise<unknown> {
  const url = `${cfg.api_base}${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) return handleApiError(res, context ?? `DELETE ${path}`);
  return res.json();
}

/** POST 请求：支持 404 时 fallback 到备用路径（用于 user/group 端点自动切换） */
export async function apiPostWithFallback(
  path: string,
  fallbackPath: string,
  body: Record<string, unknown>,
  context?: string,
): Promise<unknown> {
  const cfg = loadConfig();
  let url = `${cfg.api_base}${path}`;
  let res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (res.status === 404) {
    url = `${cfg.api_base}${fallbackPath}`;
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) return handleApiError(res, context ?? `POST ${path}`);
  return res.json();
}

/** GET 请求：支持 404 时 fallback 到备用路径 */
export async function apiGetWithFallback(
  path: string,
  fallbackPath: string,
  params?: Record<string, string>,
  context?: string,
): Promise<unknown> {
  const cfg = loadConfig();
  const qs = params && Object.keys(params).length > 0
    ? `?${new URLSearchParams(params)}`
    : "";

  let url = `${cfg.api_base}${path}${qs}`;
  let res = await fetch(url, { headers: authHeaders() });

  if (res.status === 404) {
    url = `${cfg.api_base}${fallbackPath}${qs}`;
    res = await fetch(url, { headers: authHeaders() });
  }

  if (!res.ok) return handleApiError(res, context ?? `GET ${path}`);
  return res.json();
}