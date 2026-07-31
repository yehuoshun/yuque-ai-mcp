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

    const res = result as { data?: Array<Record<string, unknown>> };
    const items = res?.data ?? [];

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ total: items.length, data: items }, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            total: items.length,
            offset,
            limit,
            data: items.map(formatRepo),
          }, null, 2),
        },
      ],
    };
  },
};