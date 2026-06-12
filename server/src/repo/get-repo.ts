/**
 * repo/get — 获取知识库详情
 *
 * 端点：GET /api/v2/repos/:book_id
 * 职责：返回知识库完整信息（含 toc_yml 目录）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoGet: McpTool = {
  name: "yuque_get_repo",
  description: "获取知识库详情（book_id 支持 ID 或 namespace，返回 name/description/public/items_count/likes_count/toc_yml 等完整信息）",

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

    const url = `${cfg.api_base}/repos/${bookId}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取知识库详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};