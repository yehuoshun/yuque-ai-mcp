/**
 * search/search — 通用搜索
 *
 * 端点：GET /api/v2/search
 * 职责：搜索文档或知识库，支持 scope 范围过滤
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";


export const searchGeneral: McpTool = {
  name: "yuque_search",
  description: "General search across Yuque documents and repositories",

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
    const q = args?.q as string;
    const type = args?.type as string;
    const scope = args?.scope as string | undefined;
    const page = (args?.page as number) ?? 1;
    const creator = args?.creator as string | undefined;

    const params: Record<string, string> = { q, type, page: String(page) };
    if (scope) params.scope = scope;
    if (creator) params.creator = creator;

    const data = await apiGet("/search", params, "Search");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};