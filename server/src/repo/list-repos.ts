/**
 * repo/list — 获取知识库列表
 *
 * 端点：GET /api/v2/users/:login/repos 或 GET /api/v2/groups/:login/repos
 * 职责：获取用户或团队下的知识库列表
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const repoList: McpTool = {
  name: "yuque_list_repos",
  description: "获取用户或团队的知识库列表（login 支持 Login 或 ID，type 可过滤 Book/Design，limit ≤ 100）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "用户/团队的 Login 或 ID（必填）" },
      type: { type: "string", description: "类型过滤：Book（文档型）/ Design（画板型）" },
      offset: { type: "number", description: "分页偏移，默认 0" },
      limit: { type: "number", description: "每页数量，≤100，默认 100" },
      filterByAbility: { type: "string", description: "权限过滤：create_doc（仅返回有创建文档权限的知识库）" },
    },
    required: ["login"],
  },

  async handler(args) {
    const cfg = loadConfig();
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
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};