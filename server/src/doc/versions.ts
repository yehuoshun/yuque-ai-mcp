/**
 * doc/versions — 获取文档历史版本列表
 *
 * 端点：GET /api/v2/doc_versions?doc_id={doc_id}
 * 职责：返回文档最近 100 个已发布版本（按时间倒序）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const docVersions: McpTool = {
  name: "yuque_get_doc_versions",
  description: "获取文档历史版本列表（按时间倒序，最多返回最近 100 个已发布版本）",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: "number", description: "文档 ID（必填）" },
    },
    required: ["doc_id"],
  },

  async handler(args) {
    const docId = args?.doc_id as number;

    const url = `${YUQUE_API_BASE}/doc_versions?doc_id=${docId}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取文档历史版本");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};