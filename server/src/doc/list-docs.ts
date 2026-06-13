/**
 * doc/list — 获取知识库的文档列表
 *
 * 端点：GET /api/v2/repos/:book_id/docs 或 GET /api/v2/repos/:group_login/:book_slug/docs
 * 职责：获取指定知识库下的文档列表，支持分页和额外字段
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatDocSummary, wrapResult } from "../common/format.js";


export const docList: McpTool = {
  name: "yuque_list_docs",
  description: "List documents in a repository (book_id supports numeric ID or namespace like group/book_slug, limit ≤ 100, sorted by updated_at desc, supports optional_properties)",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 100" },
      optional_properties: { type: "string", description: "Extra fields, comma-separated. Supports: hits, tags, latest_version_id" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const bookId = args?.book_id as string;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const opt = (args?.optional_properties as string) || "";
    const raw = args?.raw as boolean | undefined;

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
      content: [{ type: "text" as const, text: wrapResult(data, formatDocSummary, raw) }],
    };
  },
};