/**
 * mine/common — 语雀 Web API 请求（Cookie 认证）
 *
 * 适用于 /api/mine/* 路径的 Web API，需要 Cookie 登录态。
 * 配置：config/config.json 中的 cookie 和 ctoken 字段
 */

import { loadConfig } from "../common/config.js";

export const MINE_BASE = "https://www.yuque.com/api/mine";

export async function webRequest(
  url: string,
  opts: { method?: "GET" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<unknown> {
  const cfg = loadConfig();
  const cookie = cfg.cookie || "";
  const ctoken = cfg.ctoken || "";

  if (!cookie || !ctoken) {
    throw new Error(
      "此 API 需要 Cookie 登录态，请在 config/config.json 中配置 cookie 和 ctoken 字段。" +
      "获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
    );
  }

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cookie": cookie,
    "x-csrf-token": ctoken,
    "Referer": "https://www.yuque.com/dashboard/books",
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
