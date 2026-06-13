/**
 * board/get — 获取文档中的画板资源
 *
 * 端点：GET /api/v2/yfm/boards
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

export const boardGet: McpTool = {
  name: "yuque_get_board",
  description: "Get a board resource from a document, returns JSON DSL and summary stats",

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
    const cfg = loadConfig();
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const resourceId = args?.resource_id as string;

    if (!docId && !url) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Provide doc_id or url" }, null, 2) }],
        isError: true,
      };
    }

    const params = new URLSearchParams();
    params.set("resource_type", "board");
    params.set("src", resourceId);
    if (docId) params.set("doc_id", String(docId));
    if (url) params.set("url", url);

    const res = await fetch(`${cfg.api_base}/yfm/boards?${params}`, {
      headers: { "X-Auth-Token": cfg.token },
    });
    if (!res.ok) return handleApiError(res, "Get board");
    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};