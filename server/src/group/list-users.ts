/**
 * group/list-users — 获取团队成员列表
 *
 * 端点：GET /api/v2/groups/:login/users
 * 职责：获取指定团队的所有成员，支持角色过滤和分页
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

export const groupListUsers: McpTool = {
  name: "yuque_get_group_users",
  description: "List group members (login supports group login or ID, role filter: admin/member/readonly, PageSize fixed 100)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      role: { type: "number", description: "Role filter: 0=admin, 1=member, 2=readonly" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    if (role !== undefined) params.set("role", String(role));

    const url = `${cfg.api_base}/groups/${login}/users?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取团队成员");

    const { data } = (await res.json()) as { data: GroupUser[] };
    const result = raw
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data.map(formatGroupUser), null, 2);
    return {
      content: [{ type: "text" as const, text: result }],
    };
  },
};