/**
 * statistic/docs — 团队文档统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics/docs
 * 职责：返回团队文档维度的统计数据，支持 bookId/name 过滤和排序
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const docStatistics: McpTool = {
  name: "yuque_get_doc_statistics",
  description: "Get group document statistics (supports bookId/name filter, date range, multi-field sorting, limit ≤ 20)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      bookId: { type: "number", description: "Filter by repository ID" },
      name: { type: "string", description: "Filter by document name" },
      range: { type: "number", description: "Date range: 0=all, 30=last 30 days, 365=last year (default 0)" },
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Page size, max 20, default 10" },
      sortField: { type: "string", description: "Sort field: content_updated_at, word_count, read_count, like_count, comment_count, created_at" },
      sortOrder: { type: "string", description: "Sort order: desc (default) / asc" },
    },
    required: ["login"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const login = args?.login as string;
    const bookId = args?.bookId as number | undefined;
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
    if (bookId !== undefined) params.set("bookId", String(bookId));
    if (name) params.set("name", name);
    if (sortField) params.set("sortField", sortField);

    const url = `${cfg.api_base}/groups/${login}/statistics/docs?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取文档统计");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};