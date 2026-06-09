/**
 * user/groups — 获取用户所属的团队列表
 *
 * 端点：GET /api/v2/users/:id/groups
 * 职责：获取指定用户加入的所有团队
 */

import type { McpTool } from "../types.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

interface Group {
  id: number;
  type: string;
  login: string;
  name: string;
  avatar_url: string;
  books_count: number;
  public_books_count: number;
  members_count: number;
  public: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export const userGroups: McpTool = {
  name: "yuque_get_user_groups",
  description: "获取用户所属的团队列表（id 支持 login 或 ID，role 可过滤管理员/成员，PageSize 固定 100）",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "用户 login 或 ID（必填）" },
      role: { type: "number", description: "角色过滤：0=管理员 / 1=成员" },
      offset: { type: "number", description: "分页偏移，默认 0" },
    },
    required: ["id"],
  },

  async handler(args) {
    const id = args?.id as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    if (role !== undefined) params.set("role", String(role));

    const url = `${YUQUE_API_BASE}/users/${id}/groups?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`获取用户团队失败 (${res.status}): ${body}`);
    }

    const { data } = (await res.json()) as { data: Group[] };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};