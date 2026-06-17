/**
 * board/update — 更新文档中的画板资源
 *
 * 端点：PUT /api/v2/yfm/boards
 */

import type { McpTool } from "../common/types.js";
import { apiPut } from "../common/api-client.js";
import { handleApiCall } from "../common/format.js";
import { requiredString } from "../common/validate.js";

export const boardUpdate: McpTool = {
  name: "yuque_update_board",
  description: "Update a board resource (text or dsl, choose one). PUT /yfm/boards. 详见 references/api/board_api.md",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: "number", description: "Document ID (mutually exclusive with url)" },
      url: { type: "string", description: "Document URL (mutually exclusive with doc_id)" },
      resource_id: { type: "string", description: "Board resource ID (required, extract from board://<resource_id>)" },
      text: { type: "string", description: "New textual DSL content (mutually exclusive with dsl)" },
      dsl: { type: "string", description: "New JSON DSL object (mutually exclusive with text), sent as JSON" },
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
    const text = args?.text as string | undefined;
    const dslRaw = args?.dsl as string | undefined;

    if (!docId && !url) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url / Provide doc_id or url" }, null, 2) }],
        isError: true,
      };
    }
    if (!text && !dslRaw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "请提供 text 或 dsl（二选一）/ Provide text or dsl (choose one)" }, null, 2) }],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = { resource_type: "board", src: resourceId };
    if (docId) payload.doc_id = docId;
    if (url) payload.url = url;
    if (text !== undefined) {
      payload.text = text;
    } else if (dslRaw !== undefined) {
      try { payload.dsl = JSON.parse(dslRaw); } catch { payload.dsl = dslRaw; }
    }

    const data = await apiPut("/yfm/boards", payload, "Update board");
    return handleApiCall(data, undefined as any);
  },
};