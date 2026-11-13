/**
 * statistic/group — 团队汇总统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics
 * 职责：返回团队维度的汇总统计数据
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { handleApiCall } from "../common/format.js";
import { requiredString } from "../common/validate.js";


export const groupStatistics: McpTool = {
  name: "yuque_get_group_statistics",
  description: "Get group summary statistics. GET /groups/:login/statistics. 详见 references/api/statistic_api.md",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
    },
    required: ["login"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.login, "login");
    if (__v) return __v;
    const login = args?.login as string;
    const data = await apiGet(`/groups/${login}/statistics`, undefined, "Get group stats");
    return handleApiCall(data, undefined as any);
  },
};