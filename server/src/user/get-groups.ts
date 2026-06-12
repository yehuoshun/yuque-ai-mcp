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
  description: "获取用户所属的团队列表（id 支持 login 或 ID，role 可过滤管理员/成员）",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "用户 login 或 ID（必填）" },
      role: { type: "number", description: "角色过滤：0=管理员 / 1=成员" },
      offset: { type: "number", description: "分页偏移，默认 0" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
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