/**
 * board/get — 获取文档中的画板资源
 *
 * 端点：GET /api/v2/yfm/boards
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";

export const boardGet: McpTool = {
  name: "yuque_get_board",
  description: "Get board resource JSON DSL and summary stats from a document. GET /yfm/boards. 详见 references/api/board_api.md",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: "number", description: "Document ID (mutually exclusive with url)" },
      url: { type: "string", description: "Document URL (mutually exclusive with doc_id)" },
      resource_id: { type: "string", description: "Board resource ID (required, extract the ID part from board://<resource_id>)" },
    },
    required: ["resource_id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.resource_id, "resource_id");
    if (__v) return __v;
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const resourceId = args?.resource_id as string;

    if (!docId && !url) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url / Provide doc_id or url" }, null, 2) }],
        isError: true,
      };
    }

    const params: Record<string, string> = { resource_type: "board", src: resourceId };
    if (docId) params.doc_id = String(docId);
    if (url) params.url = url;

    const data = await apiGet("/yfm/boards", params, "Get board");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};