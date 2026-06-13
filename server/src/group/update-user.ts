/**
 * group/update-user — 变更团队成员角色
 *
 * 端点：PUT /api/v2/groups/:login/users/:id
 * 职责：修改指定成员在团队中的角色
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatGroupUser, wrapResult } from "../common/format.js";


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
  description: "Change a group member role (login supports group login or ID, id supports user login or ID, role: 0=admin, 1=member, 2=readonly)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      id: { type: "string", description: "User login or ID (required)" },
      role: { type: "number", description: "Role: 0=admin, 1=member, 2=readonly (default 1)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login", "id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const id = args?.id as string;
    const role = (args?.role as number) ?? 1;

    const url = `${cfg.api_base}/groups/${login}/users/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) return handleApiError(res, "变更成员角色");

    const { data } = (await res.json()) as { data: GroupUser };
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatGroupUser, raw) }],
    };
  },
};