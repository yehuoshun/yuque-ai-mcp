/**
 * search/search — 通用搜索
 *
 * 端点：GET /api/v2/search
 * 职责：搜索文档或知识库，支持 scope 范围过滤
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { formatSearchResult, handleApiCall } from "../common/format.js";
import { requiredString, oneOf } from "../common/validate.js";


export const searchGeneral: McpTool = {
  name: "yuque_search",
  description: "General search across Yuque docs and repos. GET /search?q=:q&type=:type. 详见 references/api/search_api.md",

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
    // @validate
    const __v = requiredString(args?.q, "q")
      || oneOf(args?.type, "type", ["doc", "repo"]);
    if (__v) return __v;
    const q = args?.q as string;
    const type = args?.type as string;
    const scope = args?.scope as string | undefined;
    const page = (args?.page as number) ?? 1;
    const creator = args?.creator as string | undefined;

    const params: Record<string, string> = { q, type, page: String(page) };
    if (scope) params.scope = scope;
    if (creator) params.creator = creator;

    const data = await apiGet("/search", params, "Search");
    return handleApiCall(data, formatSearchResult);
  },
};