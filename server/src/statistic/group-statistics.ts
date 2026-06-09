/**
 * statistic/group — 团队汇总统计数据
 *
 * 端点：GET /api/v2/groups/:login/statistics
 * 职责：返回团队维度的汇总统计数据（文档数、阅读量、点赞量等）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const groupStatistics: McpTool = {
  name: "yuque_get_group_statistics",
  description: "获取团队汇总统计数据（文档数、阅读量、点赞量、评论量、知识库数量等）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队的 Login 或 ID（必填）" },
    },
    required: ["login"],
  },

  async handler(args) {
    const login = args?.login as string;

    const url = `${YUQUE_API_BASE}/groups/${login}/statistics`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取团队统计");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};