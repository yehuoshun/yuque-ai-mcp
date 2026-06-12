/**
 * toc/get — 获取知识库目录
 *
 * 端点：GET /api/v2/repos/:book_id/toc
 * 职责：返回知识库完整目录树（扁平数组，通过 uuid 父子关系导航）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatToc, wrapResult } from "../common/format.js";


export const tocGet: McpTool = {
  name: "yuque_get_toc",
  description: "获取知识库目录树（book_id 支持 ID 或 namespace，返回扁平数组通过 uuid/parent_uuid/child_uuid 导航）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const url = `${cfg.api_base}/repos/${bookId}/toc`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取目录");

    const data = await res.json();
    const items = data?.data ?? data;
    return {
      content: [{ type: "text" as const, text: wrapResult(items, formatToc, raw) }],
    };
  },
};