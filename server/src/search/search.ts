/**
 * search/search — 通用搜索
 *
 * 端点：GET /api/v2/search
 * 职责：搜索文档或知识库，支持 scope 范围过滤
 */

import type { McpTool } from "../types.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const search: McpTool = {
  name: "yuque_search",
  description: "通用搜索：搜索语雀文档或知识库（PageSize 固定 20，支持 scope 范围过滤）",

  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "搜索关键词（必填，≤200 字符）" },
      type: { type: "string", description: "搜索类型：doc（文档）/ repo（知识库）" },
      scope: { type: "string", description: "搜索范围（≤400 字符），如 group 或 group/book_slug" },
      page: { type: "number", description: "页码（1-100）" },
      creator: { type: "string", description: "仅搜索指定作者 login" },
    },
    required: ["q", "type"],
  },

  async handler(args) {
    const q = args?.q as string;
    const type = args?.type as string;
    const scope = args?.scope as string | undefined;
    const page = (args?.page as number) ?? 1;
    const creator = args?.creator as string | undefined;

    const params = new URLSearchParams();
    params.set("q", q);
    params.set("type", type);
    params.set("page", String(page));
    if (scope) params.set("scope", scope);
    if (creator) params.set("creator", creator);

    const url = `${YUQUE_API_BASE}/search?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`搜索失败 (${res.status}): ${body}`);
    }

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};