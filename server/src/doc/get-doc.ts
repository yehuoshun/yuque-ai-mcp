/**
 * doc/get — 获取文档详情
 *
 * 端点：GET /api/v2/repos/docs/:id
 * 职责：获取文档完整内容，id 支持文档 ID 或 slug
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { requiredString, positiveInt, maxValue, optionalBoolean } from "../common/validate.js";
import { formatDoc, handleApiCall } from "../common/format.js";


export const docGet: McpTool = {
  name: "yuque_get_doc",
  description: "Get document detail (body/body_html/body_lake). Supports id or slug. GET /repos/docs/:id. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Document ID (numeric) or slug (required)" },
      book_id: { type: "string", description: "Repository ID or namespace (optional; required when id is a slug)" },
      page_size: { type: "number", description: "Table page size, 1-200, default 100" },
      page: { type: "number", description: "Table page number, ≥1, default 1" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.id, "id")
      || positiveInt(args?.page_size, "page_size")
      || maxValue(args?.page_size, "page_size", 200)
      || positiveInt(args?.page, "page")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const id = args?.id as string;
    const bookId = args?.book_id as string | undefined;
    const pageSize = (args?.page_size as number) ?? 100;
    const page = (args?.page as number) ?? 1;
    const raw = args?.raw as boolean | undefined;

    const params: Record<string, string> = {
      page_size: String(Math.min(pageSize, 200)),
      page: String(page),
    };

    // 数字 ID → /repos/docs/:id；非数字（slug）→ 需 book_id 上下文 /repos/:book_id/docs/:slug
    const isNumericId = /^\d+$/.test(id);
    let path: string;
    if (isNumericId) {
      path = `/repos/docs/${id}`;
    } else {
      if (!bookId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "按 slug 读取需要 book_id 参数（数字 ID 或 namespace） / reading by slug requires book_id (numeric ID or namespace)" }, null, 2) }],
          isError: true,
        };
      }
      path = `/repos/${bookId}/docs/${id}`;
    }

    const data = await apiGet(path, params, "Get doc");
    return handleApiCall(data, formatDoc, raw);
  },
};