/**
 * repo/delete — 删除知识库
 *
 * 端点：DELETE /api/v2/repos/:book_id
 * 职责：删除指定知识库（不可恢复）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoDelete: McpTool = {
  name: "yuque_delete_repo",
  description: "Delete a repository (book_id supports numeric ID or namespace, ⚠️ irreversible)",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const url = `${cfg.api_base}/repos/${bookId}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "删除知识库");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};