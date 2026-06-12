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
  description: "删除团队成员：将指定成员移出团队（login 支持团队 Login 或 ID，id 支持用户 Login 或 ID）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "团队 Login 或 ID（必填）" },
      id: { type: "string", description: "用户 Login 或 ID（必填）" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
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