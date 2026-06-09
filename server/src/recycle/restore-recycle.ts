/**
 * recycle/restore — 恢复回收站项目
 *
 * 端点：PUT /api/mine/recycles/:id/restore（Web API，Cookie 认证）
 */

import type { McpTool } from "../common/types.js";
import { webRequest, MINE_BASE } from "./common.js";

export const recycleRestore: McpTool = {
  name: "yuque_restore_recycle",
  description: "恢复回收站项目（需要 YUQUE_COOKIE + YUQUE_CTOKEN 环境变量）",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: "number", description: "回收站项目 ID（必填）" },
    },
    required: ["recycle_id"],
  },

  async handler(args) {
    const recycleId = args?.recycle_id as number;

    await webRequest(`${MINE_BASE}/${recycleId}/restore`, { method: "PUT" });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ restored: true, recycle_id: recycleId }, null, 2),
        },
      ],
    };
  },
};