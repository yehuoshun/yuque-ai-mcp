/**
 * doc/versions — 获取文档历史版本列表
 *
 * 端点：GET /api/v2/doc_versions?doc_id={doc_id}
 * 职责：返回文档最近 100 个已发布版本（按时间倒序）
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { reqId, optionalBoolean, check, toIdNum } from "../common/validate.js";
import { formatDocVersion, handleApiCall } from "../common/format.js";


export const docVersions: McpTool = {
  name: "yuque_get_doc_versions",
  description: "List document version history (last 100 published versions). GET /doc_versions?doc_id=:id. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: ["string", "number"], description: "Document ID (required). number 或数字字符串都接受" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["doc_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      reqId(args?.doc_id, "doc_id"),
      optionalBoolean(args?.raw, "raw"),
    );
    if (__v) return __v;

    const docId = toIdNum(args?.doc_id);
    const raw = args?.raw as boolean | undefined;

    const data = await apiGet("/doc_versions", { doc_id: String(docId) }, "Get doc versions");
    return handleApiCall(data, formatDocVersion, raw);
  },
};