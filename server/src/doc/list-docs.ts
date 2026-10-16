/**
 * doc/list — 获取知识库的文档列表
 *
 * 端点：GET /api/v2/repos/:book_id/docs
 * 职责：获取指定知识库下的文档列表，支持分页和额外字段
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { requiredString, positiveInt, maxValue, optionalBoolean, optionalString } from "../common/validate.js";
import { formatDocSummary, handleApiCall } from "../common/format.js";


export const docList: McpTool = {
  name: "yuque_list_docs",
  description: "List documents in a repo, sorted by updated_at desc. limit ≤ 100. Supports deleted (recycle view) and changed_at_gte (incremental sync). GET /repos/:id/docs. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 100" },
      optional_properties: { type: "string", description: "Extra fields, comma-separated. Supports: hits, tags, latest_version_id" },
      deleted: { type: "boolean", description: "Return the deleted-docs view (default false). ⚠️ Yuque treats the mere presence of this param as truthy, so it is only sent when true; response items carry deleted_at / deleted_slug" },
      changed_at_gte: { type: "string", description: "Only return docs changed at/after this ISO 8601 time (incremental sync), e.g. 2026-10-16T00:00:00Z" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.book_id, "book_id")
      || positiveInt(args?.limit, "limit")
      || maxValue(args?.limit, "limit", 100)
      || optionalBoolean(args?.deleted, "deleted")
      || optionalString(args?.changed_at_gte, "changed_at_gte")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const bookId = args?.book_id as string;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const opt = (args?.optional_properties as string) || "";
    const deleted = args?.deleted as boolean | undefined;
    const changedAtGte = args?.changed_at_gte as string | undefined;
    const raw = args?.raw as boolean | undefined;

    const params: Record<string, string> = {
      offset: String(offset),
      limit: String(Math.min(limit, 100)),
    };
    if (opt) params.optional_properties = opt;
    // 语雀只看参数"是否存在"（deleted=false 也会命中已删除视图），故仅在 true 时发送
    if (deleted === true) params.deleted = "true";
    if (changedAtGte) params.changed_at_gte = changedAtGte;

    const data = await apiGet(`/repos/${bookId}/docs`, params, "List docs");
    return handleApiCall(data, formatDocSummary, raw);
  },
};