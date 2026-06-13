/**
 * board/update — 更新文档中的画板资源
 *
 * 端点：PUT /api/v2/yfm/boards
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

export const boardUpdate: McpTool = {
  name: "yuque_update_board",
  description: "Update a board resource, pass text or dsl (choose one)",

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
    const cfg = loadConfig();
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const resourceId = args?.resource_id as string;
    const text = args?.text as string | undefined;
    const dslRaw = args?.dsl as string | undefined;

    if (!docId && !url) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide doc_id or url" }, null, 2) }],
        isError: true,
      };
    }
    if (!text && !dslRaw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide text or dsl (choose one)" }, null, 2) }],
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

    const res = await fetch(`${cfg.api_base}/yfm/boards`, {
      method: "PUT",
      headers: { "X-Auth-Token": cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return handleApiError(res, "Update board");
    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};