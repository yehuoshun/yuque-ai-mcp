/**
 * doc/delete — 删除文档
 *
 * 端点：DELETE /api/v2/repos/:book_id/docs/:id
 * 职责：删除指定文档（移入回收站）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatDoc, wrapResult } from "../common/format.js";


export const docDelete: McpTool = {
  name: "yuque_delete_doc",
  description: "Delete a document (moves to recycle bin; book_id supports numeric ID or namespace, id supports numeric ID or slug)",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      id: { type: "string", description: "Document ID or slug (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const id = args?.id as string;

    const url = `${cfg.api_base}/repos/${bookId}/docs/${id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "删除文档");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatDoc, raw) }],
    };
  },
};