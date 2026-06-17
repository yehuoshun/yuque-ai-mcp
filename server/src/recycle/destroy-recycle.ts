/**
 * recycle/destroy — 彻底删除回收站项目
 *
 * 端点：DELETE /api/mine/recycles/:id（Web API，Cookie 认证）
 * ⚠️ 不可恢复
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

const RECYCLE_REFERER = "https://www.yuque.com/dashboard/recycles";

export const recycleDestroy: McpTool = {
  name: "yuque_destroy_recycle",
  description: "Permanently delete a recycle bin item (⚠️ irreversible, requires cookie+ctoken). Requires confirm='DELETE'. DELETE /mine/recycles/:id. 详见 references/api/recycle_api.md",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: "number", description: "Recycle bin item ID (required)" },
      confirm: confirmationParam.confirm,
    },
    required: ["recycle_id", "confirm"],
  },

  async handler(args) {
    const confirmed = checkConfirmation(args);
    if (confirmed) return confirmed;

    const recycleId = args?.recycle_id as number;

    await webRequest(`${MINE_BASE}/${recycleId}`, { method: "DELETE", referer: RECYCLE_REFERER });

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