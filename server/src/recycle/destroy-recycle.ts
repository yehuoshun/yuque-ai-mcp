/**
 * recycle/destroy — 彻底删除回收站项目
 *
 * 端点：DELETE /api/mine/recycles/:id（Web API，Cookie 认证）
 * ⚠️ 不可恢复
 */

import type { McpTool } from "../common/types.js";
import { webRequest, MINE_BASE } from "./common.js";

export const recycleDestroy: McpTool = {
  name: "yuque_destroy_recycle",
  description: "Permanently delete a recycle bin item (⚠️ irreversible, requires cookie + ctoken in config.json)",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: "number", description: "Recycle bin item ID (required)" },
    },
    required: ["recycle_id"],
  },

  async handler(args) {
    const recycleId = args?.recycle_id as number;

    await webRequest(`${MINE_BASE}/${recycleId}`, { method: "DELETE" });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ destroyed: true, recycle_id: recycleId }, null, 2),
        },
      ],
    };
  },
};