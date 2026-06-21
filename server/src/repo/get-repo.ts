/**
 * repo/get — 获取知识库详情
 *
 * 端点：GET /api/v2/repos/:book_id
 * 职责：返回知识库完整信息（含 toc_yml 目录）
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { requiredString, optionalBoolean } from "../common/validate.js";
import { formatRepo, handleApiCall } from "../common/format.js";


export const repoGet: McpTool = {
  name: "yuque_get_repo",
  description: "Get repo detail including toc_yml (TOC tree in YAML), namespace, items_count, full metadata. GET /repos/:id. 详见 references/api/repo_api.md",

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
    const __v = requiredString(args?.book_id, "book_id")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const data = await apiGet(`/repos/${bookId}`, undefined, "Get repo");
    return handleApiCall(data, formatRepo, raw);
  },
};