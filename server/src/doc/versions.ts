/**
 * doc/versions — 获取文档历史版本列表
 *
 * 端点：GET /api/v2/doc_versions?doc_id={doc_id}
 * 职责：返回文档最近 100 个已发布版本（按时间倒序）
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { formatDocVersion, wrapResult } from "../common/format.js";


export const docVersions: McpTool = {
  name: "yuque_get_doc_versions",
  description: "List document version history",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: "number", description: "Document ID (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["doc_id"],
  },

  async handler(args) {
    const docId = args?.doc_id as number;
    const raw = args?.raw as boolean | undefined;

    const data = await apiGet("/doc_versions", { doc_id: String(docId) }, "Get doc versions");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatDocVersion, raw) }],
    };
  },
};