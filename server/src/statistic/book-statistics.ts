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
  description: "获取团队知识库统计数据（支持 name 过滤、range 时间范围、多字段排序，limit ≤ 20）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队的 Login 或 ID（必填）" },
      name: { type: "string", description: "知识库名过滤" },
      range: { type: "number", description: "时间范围：0=全部 / 30=近30天 / 365=近一年（默认 0）" },
      page: { type: "number", description: "页码，默认 1" },
      limit: { type: "number", description: "分页数量，≤20，默认 10" },
      sortField: { type: "string", description: "排序字段：content_updated_at_ms / word_count / post_count / read_count / like_count / watch_count / comment_count" },
      sortOrder: { type: "string", description: "排序方向：desc（默认）/ asc" },
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