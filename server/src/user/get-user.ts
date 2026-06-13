/**
 * user/user — 获取当前 Token 的用户详情
 *
 * 端点：GET /api/v2/user
 * 职责：返回当前 Token 对应的用户完整信息
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { formatUser, wrapResult } from "../common/format.js";

export const userGet: McpTool = {
  name: "yuque_get_user",
  description: "Get current user profile",

  inputSchema: {
    type: "object",
    properties: {
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
  },

  async handler(args) {
    const raw = args?.raw as boolean | undefined;
    const data = await apiGet("/user", undefined, "Get user");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatUser, raw) }],
    };
  },
};