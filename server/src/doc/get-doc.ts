/**
 * doc/get — 获取文档详情
 *
 * 端点：GET /api/v2/repos/docs/:id
 * 职责：获取文档完整内容，id 支持文档 ID 或 slug
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { formatDoc, wrapResult } from "../common/format.js";


export const docGet: McpTool = {
  name: "yuque_get_doc",
  description: "Get document detail (body/body_html/body_lake). Supports id or slug. GET /repos/docs/:id. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Document ID or slug (required)" },
      page_size: { type: "number", description: "Table page size, 1-200, default 100" },
      page: { type: "number", description: "Table page number, ≥1, default 1" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.id, "id");
    if (__v) return __v;
    const id = args?.id as string;
    const pageSize = (args?.page_size as number) ?? 100;
    const page = (args?.page as number) ?? 1;
    const raw = args?.raw as boolean | undefined;

    const params: Record<string, string> = {
      page_size: String(Math.min(pageSize, 200)),
      page: String(page),
    };

    const data = await apiGet(`/repos/docs/${id}`, params, "Get doc");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatDoc, raw) }],
    };
  },
};