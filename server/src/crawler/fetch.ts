/**
 * crawler/fetch — HTTP 请求抓取网页原始 HTML
 *
 * 职责：发 HTTP GET 请求，返回原始 HTML + 响应头 + 状态码。
 * 不做任何解析、提取、清洗。Agent 拿到原始 HTML 后自行决定下一步。
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";

/** 抓取结果 */
interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bodySize: number;
  elapsed: number;
}

export const crawlFetch: McpTool = {
  name: "yuque_crawl_fetch",
  description: "Fetch a web page and return raw HTML, response headers, and status code. No parsing/extraction — Agent decides what to do next. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Target URL to fetch" },
      headers: { type: "string", description: "Custom request headers as JSON string, e.g. '{\"Cookie\":\"...\",\"Referer\":\"...\"}'" },
      timeout: { type: "number", description: "Request timeout in ms (default 15000, max 30000)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["url"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.url, "url"));
    if (__v) return __v;

    const url = args?.url as string;
    const timeout = Math.min((args?.timeout as number) ?? 15000, 30000);
    let customHeaders: Record<string, string> = {};

    if (args?.headers && typeof args.headers === "string") {
      try { customHeaders = JSON.parse(args.headers); } catch { /* ignore */ }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; YuqueCrawler/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...customHeaders,
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timer);

      const body = await res.text();
      const elapsed = Date.now() - startedAt;

      // 提取响应头
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });

      const result: FetchResult = {
        url: res.url, // 最终 URL（跟随重定向后）
        status: res.status,
        headers,
        body,
        bodySize: body.length,
        elapsed,
      };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (err) {
      clearTimeout(timer);
      const elapsed = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: isTimeout ? "TIMEOUT" : "FETCH_FAILED",
            message: isTimeout ? `请求超时 (${timeout}ms)` : `请求失败: ${message}`,
            url,
            elapsed,
          }, null, 2),
        }],
        isError: true,
      };
    }
  },
};
