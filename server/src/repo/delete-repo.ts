/**
 * repo/delete — 删除知识库
 *
 * 端点：DELETE /api/v2/repos/:book_id
 * 职责：删除指定知识库（不可恢复）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const repoDelete: McpTool = {
  name: "yuque_delete_repo",
  description: "删除语雀知识库（book_id 支持 ID 或 namespace，⚠️ 不可恢复）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;

    const url = `${YUQUE_API_BASE}/repos/${bookId}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "删除知识库");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};