/**
 * repo/list — 获取知识库列表
 *
 * 端点：GET /api/v2/users/:login/repos 或 GET /api/v2/groups/:login/repos
 * 职责：获取用户或团队下的知识库列表
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoList: McpTool = {
  name: "yuque_list_repos",
  description: "List repositories for a user or group (login supports login or ID, type filter: Book/Design, limit ≤ 100, sorted by updated_at desc)",

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
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const type = args?.type as string | undefined;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const filterByAbility = args?.filterByAbility as string | undefined;

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    params.set("limit", String(Math.min(limit, 100)));
    if (type) params.set("type", type);
    if (filterByAbility) params.set("filterByAbility", filterByAbility);

    // 先尝试用户端点，404 再试团队端点
    let url = `${cfg.api_base}/users/${login}/repos?${params}`;
    let res = await fetch(url, { headers: { "X-Auth-Token": cfg.token } });

    if (res.status === 404) {
      url = `${cfg.api_base}/groups/${login}/repos?${params}`;
      res = await fetch(url, { headers: { "X-Auth-Token": cfg.token } });
    }

    if (!res.ok) return handleApiError(res, "获取知识库列表");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};