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
    "详见 references/api/web_doc_api.md",

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

    // total 原来是「本页条数」，调用方无法判断是否还有下一页；这里改成上游 total（拿不到则 null
    // 并标 total_is_partial），同时补 returned / has_more，超过 limit 的返回一律本地切片。
    let honoredByUpstream = items.length <= limit;

    // offset>0 且上游返回不足一页时，"是否真的从 offset 开始" 无法从条数判断：
    // /api/books 实测就忽略 offset（只吃 limit）。再探一次 offset=0 的首页，
    // 若首条相同说明 offset 被无视——此时手上只有第一页，不能假装是第 offset 条，
    // 直接报错让调用方改用 limit 翻页，避免静默返回错页（旧的 offset 双跳/漏跳都源于此）。
    // 只要 offset>0，两种情况都要探一次 offset=0 的首页：
    //   a) 上游返回不足一页（honoredByUpstream）——首条相同说明 offset 被无视，手里其实是第一页；
    //   b) 上游返回超过 limit——首条与首页不同说明它不是从 0 开始的，slice(offset, offset+limit) 会错页。
    if (offset > 0 && items.length > 0) {
      const probeUrl = `https://www.yuque.com/api/docs?book_id=${bookId}&offset=0&limit=${Math.min(limit, 100)}`;
      const probe = await webRequest(probeUrl, { referer: DOC_REFERER });
      if (!isErrorResult(probe)) {
        const first = ((probe as { data?: Array<Record<string, unknown>> }).data ?? [])[0];
        const sameFirst = !!first && (first as { id?: unknown }).id === (items[0] as { id?: unknown }).id;
        if (honoredByUpstream && sameFirst) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "OFFSET_NOT_SUPPORTED",
              message: "上游 /api/docs 未按 offset 返回（拿到的仍是第一页），无法安全返回第 offset 条；请改用 limit 翻页或从 offset=0 取值",
              offset, limit,
            }, null, 2) }],
            isError: true,
          };
        }
        if (!honoredByUpstream && !sameFirst) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "INCONSISTENT_PAGE",
              message: "上游返回条数超过 limit 且起点不是 offset=0，无法安全切页；请改用 limit 翻页",
              offset, limit, returned: items.length,
            }, null, 2) }],
            isError: true,
          };
        }
      }
    }

    const page = honoredByUpstream ? items : items.slice(offset, offset + limit);
    const total = honoredByUpstream ? ((meta as { total?: number }).total ?? null) : items.length;
    const hasMore = honoredByUpstream ? items.length >= limit : items.length > offset + limit;

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ meta, total, offset, limit, returned: page.length, has_more: hasMore, data: page }, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            meta,
            total,
            total_is_partial: honoredByUpstream && (meta as { total?: number }).total === undefined,
            offset,
            limit,
            returned: page.length,
            has_more: hasMore,
            data: page.map(formatDocSummary),
          }, null, 2),
        },
      ],
    };
  },
};