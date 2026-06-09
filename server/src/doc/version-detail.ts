/**
 * doc/version-detail — 获取文档历史版本详情
 *
 * 端点：GET /api/v2/doc_versions/:id
 * 职责：返回指定版本的完整内容（正文、diff 等）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

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
    const id = args?.id as number;

    const url = `${YUQUE_API_BASE}/doc_versions/${id}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取版本详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};