/**
 * toc/get — 获取知识库目录
 *
 * 端点：GET /api/v2/repos/:book_id/toc
 * 职责：返回知识库完整目录树（扁平数组，通过 uuid 父子关系导航）
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { formatToc, wrapResult } from "../common/format.js";


export const tocGet: McpTool = {
  name: "yuque_get_toc",
  description: "Get repo TOC tree (flat array, navigable via uuid/parent_uuid/child_uuid). GET /repos/:id/toc. 详见 references/api/toc_api.md",

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

    const data = await apiGet(`/repos/${bookId}/toc`, undefined, "Get TOC");
    if (isErrorResult(data)) return data;
    const items = (data as { data?: unknown })?.data ?? data;
    return {
      content: [{ type: "text" as const, text: wrapResult(items, formatToc, raw) }],
    };
  },
};