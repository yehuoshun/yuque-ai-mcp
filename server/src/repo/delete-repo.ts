/**
 * repo/delete — 删除知识库
 *
 * 端点：DELETE /api/v2/repos/:book_id
 * 职责：删除指定知识库（不可恢复）
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { apiDelete, isErrorResult } from "../common/api-client.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoDelete: McpTool = {
  name: "yuque_delete_repo",
  description: "Delete a repository (⚠️ irreversible). Requires confirm='DELETE'",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      confirm: confirmationParam.confirm,
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "confirm"],
  },

  async handler(args) {
    const confirmed = checkConfirmation(args);
    if (confirmed) return confirmed;

    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const data = await apiDelete(`/repos/${bookId}`, "Delete repo");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};