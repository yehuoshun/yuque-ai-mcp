/**
 * statistic/members — 团队成员统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics/members
 * 职责：返回团队成员维度的统计数据，支持筛选和排序
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const memberStatistics: McpTool = {
  name: "yuque_get_member_statistics",
  description: "获取团队成员统计数据（支持 name 过滤、range 时间范围、sortField/sortOrder 排序，limit ≤ 20）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队的 Login 或 ID（必填）" },
      name: { type: "string", description: "成员名过滤" },
      range: { type: "number", description: "时间范围：0=全部 / 30=近30天 / 365=近一年（默认 0）" },
      page: { type: "number", description: "页码，默认 1" },
      limit: { type: "number", description: "分页数量，≤20，默认 10" },
      sortField: { type: "string", description: "排序字段：write_doc_count / write_count / read_count / like_count" },
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

    const url = `${cfg.api_base}/groups/${login}/statistics/members?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取成员统计");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};