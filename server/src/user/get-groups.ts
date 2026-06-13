/**
 * user/groups — 获取用户所属的团队列表
 *
 * 端点：GET /api/v2/users/:id/groups
 * 职责：获取指定用户加入的所有团队
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { formatUserGroup, wrapResult } from "../common/format.js";

export const userGetGroups: McpTool = {
  name: "yuque_get_user_groups",
  description: "List groups the user belongs to",

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
    // @validate
    const __v = requiredString(args?.id, "id");
    if (__v) return __v;
    const id = args?.id as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;
    const raw = args?.raw as boolean | undefined;

    const params: Record<string, string> = { offset: String(offset) };
    if (role !== undefined) params.role = String(role);

    const data = await apiGet(`/users/${id}/groups`, params, "Get user groups");
    if (isErrorResult(data)) return data;

    const items = (data as { data?: unknown[] })?.data ?? data;
    const formatted = Array.isArray(items) ? items.map(formatUserGroup) : items;
    return {
      content: [{ type: "text" as const, text: wrapResult(raw ? data : formatted, undefined, raw) }],
    };
  },
};