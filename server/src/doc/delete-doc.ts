/**
 * doc/delete — 删除文档
 *
 * 端点：DELETE /api/v2/repos/:book_id/docs/:id
 * 职责：删除指定文档（移入回收站）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const docDelete: McpTool = {
  name: "yuque_delete_doc",
  description: "删除语雀文档（移入回收站，book_id 支持 ID 或 namespace，id 支持文档 ID 或 slug）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      id: { type: "string", description: "文档 ID 或 slug（必填）" },
    },
    required: ["book_id", "id"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const id = args?.id as string;

    const url = `${YUQUE_API_BASE}/repos/${bookId}/docs/${id}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "删除文档");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};