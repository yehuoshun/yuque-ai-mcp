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
  description: "删除语雀文档（移入回收站，book_id 支持 ID 或 namespace，id 支持文档 ID 或 slug）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      id: { type: "string", description: "文档 ID 或 slug（必填）" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
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