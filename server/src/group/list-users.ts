/**
 * group/list-users — 获取团队成员列表
 *
 * 端点：GET /api/v2/groups/:login/users
 * 职责：获取指定团队的所有成员，支持角色过滤和分页
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

interface GroupUser {
  id: number;
  group_id: number;
  user_id: number;
  role: number;
  created_at: string;
  updated_at: string;
  group: {
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
  };
  user: {
    id: number;
    type: string;
    login: string;
    name: string;
    avatar_url: string;
    books_count: number;
    public_books_count: number;
    followers_count: number;
    following_count: number;
    public: number;
    description: string;
    created_at: string;
    updated_at: string;
  };
}

export const groupListUsers: McpTool = {
  name: "yuque_get_group_users",
  description: "获取指定团队的成员列表（login 支持团队 Login 或 ID，role 可过滤管理员/成员/只读，PageSize 固定 100）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队 Login 或 ID（必填）" },
      role: { type: "number", description: "角色过滤：0=管理员 / 1=成员 / 2=只读成员" },
      offset: { type: "number", description: "分页偏移，默认 0" },
    },
    required: ["login"],
  },

  async handler(args) {
    const login = args?.login as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    if (role !== undefined) params.set("role", String(role));

    const url = `${YUQUE_API_BASE}/groups/${login}/users?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取团队成员");

    const { data } = (await res.json()) as { data: GroupUser[] };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};