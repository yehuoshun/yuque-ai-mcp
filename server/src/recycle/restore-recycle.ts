/**
 * recycle/restore — 恢复回收站项目
 *
 * 端点：PUT /api/mine/recycles/:id/restore（Web API，Cookie 认证）
 */

import type { McpTool } from "../common/types.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

const RECYCLE_REFERER = "https://www.yuque.com/dashboard/recycles";

export const recycleRestore: McpTool = {
  name: "yuque_restore_recycle",
  description: "Restore an item from recycle bin (requires cookie+ctoken). PUT /mine/recycles/:id/restore. 详见 references/api/recycle_api.md",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: "number", description: "Recycle bin item ID (required)" },
    },
    required: ["recycle_id"],
  },

  async handler(args) {
    const recycleId = args?.recycle_id as number;

    await webRequest(`${MINE_BASE}/${recycleId}/restore`, { method: "PUT", referer: RECYCLE_REFERER });

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