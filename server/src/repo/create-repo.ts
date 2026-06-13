/**
 * repo/create — 创建知识库
 *
 * 端点：POST /api/v2/users/:login/repos 或 POST /api/v2/groups/:login/repos
 * 职责：在用户或团队下创建新知识库
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoCreate: McpTool = {
  name: "yuque_create_repo",
  description: "Create a repository (login supports login or ID, auto-detects user vs group endpoint, name and slug required)",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "User or group login / ID (required)" },
      name: { type: "string", description: "Repository name (required)" },
      slug: { type: "string", description: "Repository slug (required)" },
      description: { type: "string", description: "Description" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public (default 0)" },
      enhancedPrivacy: { type: "boolean", description: "Enhanced privacy: non-admin members get no access by default" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login", "name", "slug"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const name = args?.name as string;
    const slug = args?.slug as string;
    const description = args?.description as string | undefined;
    const isPublic = (args?.public as number) ?? 0;
    const enhancedPrivacy = args?.enhancedPrivacy as boolean | undefined;

    const payload: Record<string, unknown> = { name, slug, public: isPublic };
    if (description) payload.description = description;
    if (enhancedPrivacy !== undefined) payload.enhancedPrivacy = enhancedPrivacy;

    // 先试用户端点，404 再试团队端点
    let url = `${cfg.api_base}/users/${login}/repos`;
    let res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 404) {
      url = `${cfg.api_base}/groups/${login}/repos`;
      res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Auth-Token": cfg.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) return handleApiError(res, "创建知识库");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};