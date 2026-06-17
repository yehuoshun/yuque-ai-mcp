/**
 * group/delete-user — 删除团队成员
 *
 * 端点：DELETE /api/v2/groups/:login/users/:id
 * 职责：将指定成员移出团队
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { check, requiredString } from "../common/validate.js";
import { apiDelete } from "../common/api-client.js";
import { formatGroupUser, handleApiCall } from "../common/format.js";


export const groupDeleteUser: McpTool = {
  name: "yuque_delete_group_user",
  description: "Remove a member from a group. ⚠️ Requires confirm='DELETE'. DELETE /groups/:login/users/:id. 详见 references/api/group_api.md",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "Group login or ID (required)" },
      id: { type: "string", description: "User login or ID (required)" },
      confirm: confirmationParam.confirm,
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login", "id", "confirm"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.login, "login"),
      requiredString(args?.id, "id"),
    );
    if (__v) return __v;
    const confirmed = checkConfirmation(args);
    if (confirmed) return confirmed;

    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const id = args?.id as string;

    const data = await apiDelete(`/groups/${login}/users/${id}`, "Delete group user");
    return handleApiCall(data, formatGroupUser, raw);
  },
};