/**
 * doc/version-detail — 获取文档历史版本详情
 *
 * 端点：GET /api/v2/doc_versions/:id
 * 职责：返回指定版本的完整内容（正文、diff 等）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const docVersionDetail: McpTool = {
  name: "yuque_get_doc_version_detail",
  description: "获取文档历史版本详情（返回版本正文 body/body_html/body_asl 及 diff）",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "number", description: "版本 ID（必填）" },
    },
    required: ["id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const id = args?.id as number;

    const url = `${cfg.api_base}/doc_versions/${id}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取版本详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};