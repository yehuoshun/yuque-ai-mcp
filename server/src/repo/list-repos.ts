/**
 * repo/list — 获取知识库列表
 *
 * 端点：GET /api/v2/users/:login/repos 或 GET /api/v2/groups/:login/repos
 * 职责：获取用户或团队下的知识库列表，自动切换 user/group 端点
 */

import type { McpTool } from "../common/types.js";
import { apiGetWithFallback } from "../common/api-client.js";
import { requiredString, optionalBoolean } from "../common/validate.js";
import { formatRepo, handleApiCall } from "../common/format.js";


export const repoList: McpTool = {
  name: "yuque_list_repos",
  description: "List repos for a user or group. GET /users|groups/:login/repos. 详见 references/api/repo_api.md",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "User or group login / ID (required)" },
      type: { type: "string", description: "Type filter: Book (docs) / Design (boards)" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 100" },
      filterByAbility: { type: "string", description: "Ability filter: create_doc (only repos with doc creation permission)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.login, "login")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const type = args?.type as string | undefined;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const filterByAbility = args?.filterByAbility as string | undefined;

    const params: Record<string, string> = {
      offset: String(offset),
      limit: String(Math.min(limit, 100)),
    };
    if (type) params.type = type;
    if (filterByAbility) params.filterByAbility = filterByAbility;

    const data = await apiGetWithFallback(
      `/users/${login}/repos`,
      `/groups/${login}/repos`,
      params,
      "List repos",
    );
    return handleApiCall(data, formatRepo, raw);
  },
};