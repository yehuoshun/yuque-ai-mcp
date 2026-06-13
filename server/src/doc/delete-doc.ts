/**
 * doc/delete — 删除文档
 *
 * 端点：DELETE /api/v2/repos/:book_id/docs/:id
 * 职责：删除指定文档（移入回收站）
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { apiDelete, isErrorResult } from "../common/api-client.js";
import { formatDoc, wrapResult } from "../common/format.js";


export const docDelete: McpTool = {
  name: "yuque_delete_doc",
  description: "Delete a document (moves to recycle bin). ⚠️ Requires confirm='DELETE'",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      id: { type: "string", description: "Document ID or slug (required)" },
      confirm: confirmationParam.confirm,
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "id", "confirm"],
  },

  async handler(args) {
    const confirmed = checkConfirmation(args);
    if (confirmed) return confirmed;

    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const id = args?.id as string;

    const data = await apiDelete(`/repos/${bookId}/docs/${id}`, "Delete doc");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatDoc, raw) }],
    };
  },
};