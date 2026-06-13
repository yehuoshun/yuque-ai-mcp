/**
 * recycle/common — 回收站 Web API 请求
 *
 * 回收站 API 走 Web API（非 v2 OpenAPI），需要 Cookie 登录态认证。
 * 配置：config/config.json 中的 cookie 和 ctoken 字段
 */

import { loadConfig } from "../common/config.js";

const MINE_BASE = "https://www.yuque.com/api/mine/recycles";

export async function webRequest(
  url: string,
  opts: { method?: "GET" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<unknown> {
  const cfg = loadConfig();
  const cookie = cfg.cookie || "";
  const ctoken = cfg.ctoken || "";

  if (!cookie || !ctoken) {
    throw new Error(
      "回收站 API 需要 Cookie 登录态，请在 config/config.json 中配置 cookie 和 ctoken 字段 / Recycle bin API requires Cookie auth. Please configure cookie and ctoken in config/config.json." +
      "获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
    );
  }

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cookie": cookie,
    "x-csrf-token": ctoken,
    "Referer": "https://www.yuque.com/dashboard/recycles",
    "User-Agent": "Mozilla/5.0",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      let msg = `语雀 Web API 错误 [${res.status}]`;
      try {
        const err = JSON.parse(text);
        msg += `: ${err.message || text.slice(0, 200)}`;
      } catch {
        msg += `: ${text.slice(0, 200)}`;
      }
      throw new Error(msg);
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export { MINE_BASE };