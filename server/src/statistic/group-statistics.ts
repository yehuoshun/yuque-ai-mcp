/**
 * statistic/group — 团队汇总统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics
 * 职责：返回团队维度的汇总统计数据
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";


export const groupStatistics: McpTool = {
  name: "yuque_get_group_statistics",
  description: "Get group summary statistics",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
    },
    required: ["login"],
  },

  async handler(args) {
    const login = args?.login as string;
    const data = await apiGet(`/groups/${login}/statistics`, undefined, "Get group stats");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};