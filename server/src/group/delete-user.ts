/**
 * group/delete-user — 删除团队成员
 *
 * 端点：DELETE /api/v2/groups/:login/users/:id
 * 职责：将指定成员移出团队
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatGroupUser, wrapResult } from "../common/format.js";


export const groupDeleteUser: McpTool = {
  name: "yuque_delete_group_user",
  description: "Remove a member from a group (login supports group login or ID, id supports user login or ID)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      id: { type: "string", description: "User login or ID (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login", "id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const id = args?.id as string;

    const url = `${cfg.api_base}/groups/${login}/users/${id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "删除团队成员");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatGroupUser, raw) }],
    };
  },
};