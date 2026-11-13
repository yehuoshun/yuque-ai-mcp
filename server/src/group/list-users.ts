/**
 * group/list-users — 获取团队成员列表
 *
 * 端点：GET /api/v2/groups/:login/users
 * 职责：获取指定团队的所有成员，支持角色过滤和分页
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { requiredString, oneOf, optionalBoolean } from "../common/validate.js";
import { formatGroupUser, handleApiCall } from "../common/format.js";


export const groupListUsers: McpTool = {
  name: "yuque_get_group_users",
  description: "List group members (page size 100). Supports role filter (0=admin,1=member,2=readonly). GET /groups/:login/users. 详见 references/api/group_api.md",

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
    // @validate
    const __v = requiredString(args?.login, "login")
      || oneOf(args?.role, "role", [0, 1, 2])
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const role = args?.role as number | undefined;
    const offset = (args?.offset as number) ?? 0;

    const params: Record<string, string> = { offset: String(offset) };
    if (role !== undefined) params.role = String(role);

    const data = await apiGet(`/groups/${login}/users`, params, "Get group users");
    // 语雀返回纯数组，包装成 { data: [...] } 让 wrapResult 正确 map
    const wrapped = Array.isArray(data) ? { data } : data;
    return handleApiCall(wrapped, formatGroupUser, raw);
  },
};