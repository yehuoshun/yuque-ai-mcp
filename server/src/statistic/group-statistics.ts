/**
 * statistic/group — 团队汇总统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics
 * 职责：返回团队维度的汇总统计数据（文档数、阅读量、点赞量等）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const groupStatistics: McpTool = {
  name: "yuque_get_group_statistics",
  description: "Get group summary statistics (doc count, reads, likes, comments, repo count, etc.)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
    },
    required: ["login"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const login = args?.login as string;

    const url = `${cfg.api_base}/groups/${login}/statistics`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取团队统计");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};