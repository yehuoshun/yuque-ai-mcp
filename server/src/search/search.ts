/**
 * search/search — 通用搜索
 *
 * 端点：GET /api/v2/search
 * 职责：搜索文档或知识库，支持 scope 范围过滤
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const searchGeneral: McpTool = {
  name: "yuque_search",
  description: "General search across Yuque documents and repositories (PageSize fixed 20, returns title/summary/url/book_name, supports scope filter)",

  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", description: "Search keyword (required, max 200 chars)" },
      type: { type: "string", description: "Search type: doc (document) / repo (repository)" },
      scope: { type: "string", description: "Search scope (max 400 chars), e.g. group or group/book_slug" },
      page: { type: "number", description: "Page number (1-100)" },
      creator: { type: "string", description: "Filter by author login" },
    },
    required: ["q", "type"],
  },

  async handler(args) {
    const cfg = loadConfig();
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

    const url = `${cfg.api_base}/search?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "搜索");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};