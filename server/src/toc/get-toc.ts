/**
 * toc/get — 获取知识库目录
 *
 * 端点：GET /api/v2/repos/:book_id/toc
 * 职责：返回知识库完整目录树（扁平数组，通过 uuid 父子关系导航）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const tocGet: McpTool = {
  name: "yuque_get_toc",
  description: "获取知识库目录树（book_id 支持 ID 或 namespace，返回扁平数组通过 uuid/parent_uuid/child_uuid 导航）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;

    const url = `${YUQUE_API_BASE}/repos/${bookId}/toc`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取目录");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};