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
  description: "彻底删除回收站项目（⚠️ 不可恢复，需要 config.json 中配置 cookie + ctoken）",

  inputSchema: {
    type: "object",
    properties: {
      recycle_id: { type: "number", description: "回收站项目 ID（必填）" },
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