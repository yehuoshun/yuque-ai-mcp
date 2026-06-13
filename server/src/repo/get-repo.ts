/**
 * repo/get — 获取知识库详情
 *
 * 端点：GET /api/v2/repos/:book_id
 * 职责：返回知识库完整信息（含 toc_yml 目录）
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoGet: McpTool = {
  name: "yuque_get_repo",
  description: "Get repository detail",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.book_id, "book_id");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const data = await apiGet(`/repos/${bookId}`, undefined, "Get repo");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};