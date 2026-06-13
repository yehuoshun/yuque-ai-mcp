/**
 * user/groups — 获取用户所属的团队列表
 *
 * 端点：GET /api/v2/users/:id/groups
 * 职责：获取指定用户加入的所有团队
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatUserGroup, wrapResult } from "../common/format.js";

export const userGetGroups: McpTool = {
  name: "yuque_get_user_groups",
  description: "List groups the user belongs to (id supports login or user ID, optional role filter: admin/member)",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "User login or ID (required)" },
      role: { type: "number", description: "Role filter: 0=admin, 1=member" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const id = args?.id as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;
    const raw = args?.raw as boolean | undefined;

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    if (role !== undefined) params.set("role", String(role));

    const url = `${cfg.api_base}/users/${id}/groups?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取用户团队");

    const data = await res.json();
    const items = (data?.data ?? data) as Record<string, unknown>[];
    const formatted = Array.isArray(items) ? items.map(formatUserGroup) : items;
    return {
      content: [{ type: "text" as const, text: wrapResult(raw ? data : formatted, undefined, raw) }],
    };
  },
};