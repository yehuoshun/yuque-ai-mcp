/**
 * recycle/restore — 恢复回收站项目
 *
 * 端点：PUT /api/mine/recycles/:id/restore（Web API，Cookie 认证）
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { reqId, toIdNum } from "../common/validate.js";
import { MINE_BASE } from "./common.js";

const RECYCLE_REFERER = "https://www.yuque.com/dashboard/recycles";

export const recycleRestore: McpTool = {
  name: "yuque_restore_recycle",
  description: "Restore an item from recycle bin (requires cookie+ctoken). PUT /mine/recycles/:id/restore. 详见 references/api/recycle_api.md",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: ["string", "number"], description: "Recycle bin item ID (required). number 或数字字符串都接受" },
    },
    required: ["recycle_id"],
  },

  async handler(args) {
    // @validate
    const __v = reqId(args?.recycle_id, "recycle_id");
    if (__v) return __v;
    const recycleId = toIdNum(args?.recycle_id);

    const restoreResult = await webRequest(`${MINE_BASE}/${recycleId}/restore`, { method: "PUT", referer: RECYCLE_REFERER });
    if (isErrorResult(restoreResult)) return restoreResult;

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