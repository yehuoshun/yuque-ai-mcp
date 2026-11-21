/**
 * web-doc/list-repos — Cookie 态列知识库列表
 *
 * 端点：GET /api/books?user_id={user_id}（Web API，Cookie 认证）
 * 职责：返回当前用户或指定用户的知识库列表
 *
 * 相比 v2 list_repos 的优势：
 *   - 不走 Token，不受会员过期限流
 *   - 返回更丰富的字段（含 abilities/extend_private/stack_id/layout 等）
 *   - 支持权限检查（abilities.create_doc 等）
 *   - 不传 user_id 时自动从 /api/mine 获取当前用户
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { positiveInt, maxValue } from "../common/validate.js";

const BOOK_REFERER = "https://www.yuque.com/dashboard/books";

/**
 * 格式化知识库摘要
 */
function formatRepo(item: Record<string, unknown>) {
  return {
    id: item.id,
    type: item.type,
    slug: item.slug,
    name: item.name,
    description: item.description,
    items_count: item.items_count,
    likes_count: item.likes_count,
    watches_count: item.watches_count,
    public: item.public,
    status: item.status,
    scene: item.scene,
    source: item.source,
    cover: item.cover,
    cover_color: item.cover_color,
    abilities: item.abilities,
    user: item.user
      ? { id: (item.user as Record<string, unknown>).id, login: (item.user as Record<string, unknown>).login, name: (item.user as Record<string, unknown>).name }
      : { id: item.user_id },
    creator: item.creator
      ? { id: (item.creator as Record<string, unknown>).id, login: (item.creator as Record<string, unknown>).login }
      : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    content_updated_at: item.content_updated_at,
  };
}

export const webRepoList: McpTool = {
  name: "yuque_web_list_repos",
  description:
    "Cookie-based: List repos for current user. " +
    "Returns richer fields than v2 list_repos (abilities, cover_color, scene, etc.). " +
    "Includes permission info (abilities.create_doc, modify_setting, destroy). " +
    "No membership required. " +
    "GET /api/books. " +
    "详见 references/api/repo_api.md",

  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "User ID (numeric, optional, defaults to current user)" },
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 100" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
  },

  async handler(args) {
    // @validate
    const __v = positiveInt(args?.limit, "limit")
      || maxValue(args?.limit, "limit", 100);
    if (__v) return __v;

    let userId = args?.user_id ? Number(args?.user_id) : undefined;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;
    const raw = args?.raw as boolean | undefined;

    // 没传 user_id 时从 /api/mine 获取
    if (!userId) {
      const mineResult = await webRequest("https://www.yuque.com/api/mine", { referer: BOOK_REFERER });
      if (!isErrorResult(mineResult)) {
        const mineData = mineResult as { data?: { id?: number } };
        userId = mineData?.data?.id;
      }
    }

    let url = `https://www.yuque.com/api/books?offset=${offset}&limit=${Math.min(limit, 100)}`;
    if (userId) url += `&user_id=${userId}`;

    const result = await webRequest(url, { referer: BOOK_REFERER });

    if (isErrorResult(result)) return result;

    const res = result as { data?: Array<Record<string, unknown>>; meta?: Record<string, unknown> };
    const items = res?.data ?? [];
    const meta = res?.meta ?? {};

    // 上游 /api/books 实测忽略 offset/limit（limit=1 仍返回全部 787 条、约 715 KB），
    // 因此「返回条数 > 请求的 limit」说明上游没分页，必须在本地再切一刀，
    // 否则单次调用就能把整个书架塞进上下文（约 18 万 token）。
    let honoredByUpstream = items.length <= limit;

    // 同 list-docs：offset>0 且返回不足一页时再探一次 offset=0 的首页，
    // 首条相同说明上游无视 offset（/api/books 已知如此），此时不能假装返回第 offset 条。
    if (honoredByUpstream && offset > 0 && items.length > 0) {
      let probeUrl = `https://www.yuque.com/api/books?offset=0&limit=${Math.min(limit, 100)}`;
      if (userId) probeUrl += `&user_id=${userId}`;
      const probe = await webRequest(probeUrl, { referer: BOOK_REFERER });
      if (!isErrorResult(probe)) {
        const first = ((probe as { data?: Array<Record<string, unknown>> }).data ?? [])[0];
        if (first && (first as { id?: unknown }).id === (items[0] as { id?: unknown }).id) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "OFFSET_NOT_SUPPORTED",
              message: "上游 /api/books 未按 offset 返回（拿到的仍是第一页），无法安全返回第 offset 条；请改用 limit 翻页或从 offset=0 取值",
              offset, limit,
            }, null, 2) }],
            isError: true,
          };
        }
      }
    }

    const page = honoredByUpstream ? items : items.slice(offset, offset + limit);
    const total = honoredByUpstream ? (meta.total as number | undefined) ?? null : items.length;
    const hasMore = honoredByUpstream ? items.length >= limit : items.length > offset + limit;

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ total, offset, limit, returned: page.length, has_more: hasMore, data: page }, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            total,
            total_is_partial: honoredByUpstream && meta.total === undefined,
            offset,
            limit,
            returned: page.length,
            has_more: hasMore,
            data: page.map(formatRepo),
          }, null, 2),
        },
      ],
    };
  },
};