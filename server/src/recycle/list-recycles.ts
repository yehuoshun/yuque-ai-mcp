/**
 * recycle/list — 列出回收站项目
 *
 * 端点：GET /api/mine/recycles（Web API，Cookie 认证）
 * 职责：返回当前用户的回收站列表
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

const RECYCLE_REFERER = "https://www.yuque.com/dashboard/recycles";

export const recycleList: McpTool = {
  name: "yuque_list_recycles",
  description: "List recycle bin items (requires cookie+ctoken). GET /mine/recycles. 详见 references/api/recycle_api.md",

  inputSchema: {
    type: "object",
    properties: {
      offset: { type: "number", description: "Pagination offset, default 0" },
      limit: { type: "number", description: "Page size, max 100, default 50" },
      target_type: { type: "string", description: "Target type filter: Doc, Note, Repo" },
    },
  },

  async handler(args) {
    const offset = (args?.offset as number) ?? 0;
    const limit = Math.min((args?.limit as number) ?? 50, 100);
    const targetType = args?.target_type as string | undefined;

    let url = `${MINE_BASE}?offset=${offset}&limit=${limit}`;
    if (targetType) url += `&target_type=${targetType}`;

    const result = await webRequest(url, { referer: RECYCLE_REFERER });
    if (isErrorResult(result)) return result;
    const data = result as { data?: { data?: Array<Record<string, unknown>>; total?: number } };
    const items = data?.data?.data || [];
    const total = data?.data?.total ?? items.length;

    const formatted = items.map((r: Record<string, unknown>) => {
      const params = (r.params || {}) as Record<string, unknown>;
      const doc = (params.doc || {}) as Record<string, unknown>;
      const book = (params.book || {}) as Record<string, unknown>;
      return {
        id: r.id,
        target_id: r.target_id,
        target_type: r.target_type,
        created_at: r.created_at,
        title: doc.title || book.name || "",
        slug: doc.slug || book.slug || "",
        book: params.book
          ? { id: book.id, name: book.name, slug: book.slug }
          : null,
      };
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ total, offset, limit, items: formatted }, null, 2),
        },
      ],
    };
  },
};