/**
 * statistic/books — 团队知识库统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics/books
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";


export const bookStatistics: McpTool = {
  name: "yuque_get_book_statistics",
  description: "Get group repo statistics. GET /groups/:login/statistics/books. 详见 references/api/statistic_api.md",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      name: { type: "string", description: "Filter by repository name" },
      range: { type: "number", description: "Date range: 0=all, 30=last 30 days, 365=last year (default 0)" },
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Page size, max 20, default 10" },
      sortField: { type: "string", description: "Sort field: content_updated_at_ms, word_count, post_count, read_count, like_count, watch_count, comment_count" },
      sortOrder: { type: "string", description: "Sort order: desc (default) / asc" },
    },
    required: ["login"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.login, "login");
    if (__v) return __v;
    const login = args?.login as string;
    const name = args?.name as string | undefined;
    const range = (args?.range as number) ?? 0;
    const page = (args?.page as number) ?? 1;
    const limit = (args?.limit as number) ?? 10;
    const sortField = args?.sortField as string | undefined;
    const sortOrder = (args?.sortOrder as string) ?? "desc";

    const params: Record<string, string> = {
      range: String(range), page: String(page),
      limit: String(Math.min(limit, 20)), sortOrder,
    };
    if (name) params.name = name;
    if (sortField) params.sortField = sortField;

    const data = await apiGet(`/groups/${login}/statistics/books`, params, "Get book stats");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};