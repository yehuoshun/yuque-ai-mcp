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
  description: "创建语雀知识库（login 支持 Login 或 ID，自动判断用户/团队端点，name 和 slug 必填）",

  inputSchema: {
    type: "object",
    properties: {
      login: { type: "string", description: "用户/团队的 Login 或 ID（必填）" },
      name: { type: "string", description: "知识库名称（必填）" },
      slug: { type: "string", description: "知识库路径（必填）" },
      description: { type: "string", description: "简介" },
      public: { type: "number", description: "公开性：0=私密 / 1=公开 / 2=企业内公开（默认 0）" },
      enhancedPrivacy: { type: "boolean", description: "增强私密性：将非管理员成员也设为无权限" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
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