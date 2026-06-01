import { loadConfig } from "../config.js";

/**
 * 列出知识库分组（仪表盘视图，需 Cookie 登录态）
 * 端点: GET https://www.yuque.com/api/mine/book_stacks（v2 API 没有此端点）
 */
export async function listRepoGroups(): Promise<string> {
  const config = loadConfig();
  const cookie = config.cookie || "";
  const ctoken = config.ctoken || "";

  if (!cookie || !ctoken) {
    return JSON.stringify({
      error: "MISSING_COOKIE",
      message:
        "repo_groups 需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken。",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("https://www.yuque.com/api/mine/book_stacks", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/dashboard/books",
        "User-Agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({
        error: "FETCH_FAILED",
        status: res.status,
        message: text.slice(0, 300),
      });
    }

    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({
      error: "NETWORK_ERROR",
      message: e.message || String(e),
    });
  }
}