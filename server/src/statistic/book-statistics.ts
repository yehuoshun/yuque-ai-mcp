/**
 * statistic/books — 团队知识库统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics/books
 * 职责：返回团队知识库维度的统计数据，支持筛选和排序
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const bookStatistics: McpTool = {
  name: "yuque_get_book_statistics",
  description: "Get group repository statistics (supports name filter, date range, multi-field sorting, limit ≤ 20)",

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
    const cfg = loadConfig();
    const login = args?.login as string;
    const name = args?.name as string | undefined;
    const range = (args?.range as number) ?? 0;
    const page = (args?.page as number) ?? 1;
    const limit = (args?.limit as number) ?? 10;
    const sortField = args?.sortField as string | undefined;
    const sortOrder = (args?.sortOrder as string) ?? "desc";

    const params = new URLSearchParams();
    params.set("range", String(range));
    params.set("page", String(page));
    params.set("limit", String(Math.min(limit, 20)));
    params.set("sortOrder", sortOrder);
    if (name) params.set("name", name);
    if (sortField) params.set("sortField", sortField);

    const url = `${cfg.api_base}/groups/${login}/statistics/books?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取知识库统计");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};