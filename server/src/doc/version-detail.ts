/**
 * doc/version-detail — 获取文档历史版本详情
 *
 * 端点：GET /api/v2/doc_versions/:id
 * 职责：返回指定版本的完整内容（正文、diff 等）
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { positiveInt, optionalBoolean, check } from "../common/validate.js";
import { formatDocVersion, handleApiCall } from "../common/format.js";


export const docVersionDetail: McpTool = {
  name: "yuque_get_doc_version_detail",
  description: "Get version detail (body/body_html/body_asl + diff). GET /doc_versions/:id. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "number", description: "Version ID (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      positiveInt(args?.id, "id"),
      optionalBoolean(args?.raw, "raw"),
    );
    if (__v) return __v;

    const id = args?.id as number;
    const raw = args?.raw as boolean | undefined;

    const data = await apiGet(`/doc_versions/${id}`, undefined, "Get version detail");
    return handleApiCall(data, formatDocVersion, raw);
  },
};