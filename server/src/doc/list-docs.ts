/**
 * doc/list — 获取知识库的文档列表
 *
 * 端点：GET /api/v2/repos/:book_id/docs 或 GET /api/v2/repos/:group_login/:book_slug/docs
 * 职责：获取指定知识库下的文档列表，支持分页和额外字段
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const docList: McpTool = {
  name: "yuque_list_docs",
  description: "获取知识库的文档列表（book_id 支持 ID 或 namespace 格式如 group/book_slug，limit ≤ 100，支持 optional_properties）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      offset: { type: "number", description: "分页偏移，默认 0" },
      limit: { type: "number", description: "每页数量，≤100，默认 100" },
      optional_properties: { type: "string", description: "额外字段，逗号分隔。支持：hits / tags / latest_version_id" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const bookId = args?.book_id as string;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const opt = (args?.optional_properties as string) || "";

    const params = new URLSearchParams();
    params.set("offset", String(offset));
    params.set("limit", String(Math.min(limit, 100)));
    if (opt) params.set("optional_properties", opt);

    const url = `${cfg.api_base}/repos/${bookId}/docs?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取文档列表");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};