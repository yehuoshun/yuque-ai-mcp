/**
 * web-doc/list-docs — Cookie 态列文档列表
 *
 * 端点：GET /api/docs?book_id={book_id}（Web API，Cookie 认证）
 * 职责：返回指定知识库下的文档列表，支持分页
 *
 * 相比 v2 list_docs 的优势：
 *   - 不走 Token，不受会员过期限流
 *   - 返回更丰富的字段（含 draft_version/editor_meta/read_status 等）
 *   - 可获取 doc_versions 补充版本信息
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString, positiveInt, maxValue } from "../common/validate.js";

const DOC_REFERER = "https://www.yuque.com/";

/**
 * 格式化文档摘要列表
 */
function formatDocSummary(item: Record<string, unknown>) {
  return {
    id: item.id,
    type: item.type,
    sub_type: item.sub_type,
    slug: item.slug,
    title: item.title,
    format: item.format,
    status: item.status,
    public: item.public,
    word_count: item.word_count,
    description: item.description,
    cover: item.cover,
    read_status: item.read_status,
    draft_version: item.draft_version,
    comments_count: item.comments_count,
    likes_count: item.likes_count,
    read_count: item.read_count,
    created_at: item.created_at,
    updated_at: item.updated_at,
    content_updated_at: item.content_updated_at,
    published_at: item.published_at,
    book: item.book
      ? { id: (item.book as Record<string, unknown>).id, name: (item.book as Record<string, unknown>).name }
      : { id: item.book_id },
    user: item.user
      ? { id: (item.user as Record<string, unknown>).id, login: (item.user as Record<string, unknown>).login }
      : { id: item.user_id },
  };
}

export const webDocList: McpTool = {
  name: "yuque_web_list_docs",
  description:
    "Cookie-based: List documents in a repo. " +
    "Returns richer fields than v2 list_docs (draft_version, editor_meta, read_status, etc.). " +
    "No membership required. " +
    "GET /api/docs?book_id={book_id}. " +
    "详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric, required)" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 100" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      positiveInt(args?.limit, "limit"),
      maxValue(args?.limit, "limit", 100),
    );
    if (__v) return __v;

    const bookId = Number(args?.book_id);
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const raw = args?.raw as boolean | undefined;

    if (!bookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "book_id 必须为有效数字 / book_id must be a valid number" }, null, 2) }],
        isError: true,
      };
    }

    const url = `https://www.yuque.com/api/docs?book_id=${bookId}&offset=${offset}&limit=${Math.min(limit, 100)}`;
    const result = await webRequest(url, { referer: DOC_REFERER });

    if (isErrorResult(result)) return result;

    const res = result as { meta?: Record<string, unknown>; data?: Array<Record<string, unknown>> };
    const items = res?.data ?? [];
    const meta = res?.meta ?? {};

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ meta, data: items }, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            meta,
            total: items.length,
            offset,
            limit,
            data: items.map(formatDocSummary),
          }, null, 2),
        },
      ],
    };
  },
};