/**
 * group/update-user — 变更团队成员角色
 *
 * 端点：PUT /api/v2/groups/:login/users/:id
 * 职责：修改指定成员在团队中的角色
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

export const groupUpdateUser: McpTool = {
  name: "yuque_update_group_user",
  description: "变更团队成员角色（login 支持团队 Login 或 ID，id 支持用户 Login 或 ID，role 0=管理员/1=成员/2=只读）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队 Login 或 ID（必填）" },
      id: { type: "string", description: "用户 Login 或 ID（必填）" },
      role: { type: "number", description: "角色：0=管理员 / 1=成员 / 2=只读成员（默认 1）" },
    },
    required: ["login", "id"],
  },

  async handler(args) {
    const login = args?.login as string;
    const id = args?.id as string;
    const role = (args?.role as number) ?? 1;

    const url = `${YUQUE_API_BASE}/groups/${login}/users/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) return handleApiError(res, "变更成员角色");

    const { data } = (await res.json()) as { data: GroupUser };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};