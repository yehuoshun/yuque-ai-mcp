/**
 * group/update-user — 变更团队成员角色
 *
 * 端点：PUT /api/v2/groups/:login/users/:id
 * 职责：修改指定成员在团队中的角色
 */

import type { McpTool } from "../common/types.js";
import { apiPut } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { formatGroupUser, handleApiCall } from "../common/format.js";


export const groupUpdateUser: McpTool = {
  name: "yuque_update_group_user",
  description: "Change a group member role (0=admin,1=member,2=readonly). PUT /groups/:login/users/:id. 详见 references/api/group_api.md",

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
    // @validate
    const __v = check(
      requiredString(args?.login, "login"),
      requiredString(args?.id, "id"),
    );
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const id = args?.id as string;
    const role = (args?.role as number) ?? 1;

    const data = await apiPut(`/groups/${login}/users/${id}`, { role }, "Update group user");
    const item = (data as { data?: Record<string, unknown> })?.data ?? data;
    return handleApiCall(item, formatGroupUser, raw);
  },
};