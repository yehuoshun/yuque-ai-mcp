/**
 * board/create — 在文档中创建画板资源
 *
 * 端点：POST /api/v2/yfm/boards
 */

import type { McpTool } from "../common/types.js";
import { apiPost } from "../common/api-client.js";
import { handleApiCall } from "../common/format.js";
import { check, requiredString } from "../common/validate.js";

export const boardCreate: McpTool = {
  name: "yuque_create_board",
  description: "Create a board resource (mindmap/flowchart/architecture diagram) in a document. POST /yfm/boards. 详见 references/api/board_api.md",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: { type: "number", description: "Document ID (mutually exclusive with url)" },
      url: { type: "string", description: "Document URL (mutually exclusive with doc_id)" },
      type: { type: "string", description: "Board type (required): mindmap, flowchart, architecturediagram" },
      dsl: { type: "string", description: "Board DSL text content (required), format depends on type" },
      insert_after_lake_id: { type: "string", description: "Insert after specified Lake node, appends to document end if omitted" },
    },
    required: ["type", "dsl"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.type, "type"),
      requiredString(args?.dsl, "dsl"),
    );
    if (__v) return __v;
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const type = args?.type as string;
    const dsl = args?.dsl as string;
    const insertAfter = args?.insert_after_lake_id as string | undefined;

    if (!docId && !url) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url / Provide doc_id or url" }, null, 2) }],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = { resource_type: "board", type, dsl };
    if (docId) payload.doc_id = docId;
    if (url) payload.url = url;
    if (insertAfter) payload.insert_after_lake_id = insertAfter;

    const data = await apiPost("/yfm/boards", payload, "Create board");
    return handleApiCall(data, undefined as any);
  },
};