/**
 * user/user — 获取当前 Token 的用户详情
 *
 * 端点：GET /api/v2/user
 * 职责：返回当前 Token 对应的用户完整信息
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatUser, wrapResult } from "../common/format.js";

export const userGet: McpTool = {
  name: "yuque_get_user",
  description: "Get current user profile (id, login, name, avatar_url, books_count, description, etc.)",

  inputSchema: {
    type: "object",
    properties: {
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;

    const res = await fetch(`${cfg.api_base}/user`, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取用户信息");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatUser, raw) }],
    };
  },
};