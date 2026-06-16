/**
 * repo/create — 创建知识库
 *
 * 端点：POST /api/v2/users/:login/repos 或 POST /api/v2/groups/:login/repos
 * 职责：在用户或团队下创建新知识库，自动切换 user/group 端点
 */

import type { McpTool } from "../common/types.js";
import { apiPostWithFallback, isErrorResult } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { formatRepo, wrapResult } from "../common/format.js";
import { generateSlug } from "../common/slug.js";


export const repoCreate: McpTool = {
  name: "yuque_create_repo",
  description: "Create a repo, auto-detects user vs group endpoint. POST /users|groups/:login/repos. 详见 references/api/repo_api.md",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "User or group login / ID (required)" },
      name: { type: "string", description: "Repository name (required)" },
      slug: { type: "string", description: "Repository slug, auto-generated from name if omitted. Rule: Chinese→pinyin initials, English→kebab-case, plus timestamp last 4 digits for uniqueness." },
      description: { type: "string", description: "Description" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public (default 0)" },
      enhancedPrivacy: { type: "boolean", description: "Enhanced privacy: non-admin members get no access by default" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["login", "name"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.login, "login"),
      requiredString(args?.name, "name"),
      requiredString(args?.slug, "slug"),
    );
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const login = args?.login as string;
    const name = args?.name as string;
    const slug = (args?.slug as string) || generateSlug(name);
    const description = args?.description as string | undefined;
    const isPublic = (args?.public as number) ?? 0;
    const enhancedPrivacy = args?.enhancedPrivacy as boolean | undefined;

    const payload: Record<string, unknown> = { name, slug, public: isPublic };
    if (description) payload.description = description;
    if (enhancedPrivacy !== undefined) payload.enhancedPrivacy = enhancedPrivacy;

    const data = await apiPostWithFallback(
      `/users/${login}/repos`,
      `/groups/${login}/repos`,
      payload,
      "Create repo",
    );
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};