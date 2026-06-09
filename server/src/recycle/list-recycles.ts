/**
 * recycle/list — 列出回收站项目
 *
 * 端点：GET /api/mine/recycles（Web API，Cookie 认证）
 * 职责：返回当前用户的回收站列表
 */

import type { McpTool } from "../common/types.js";
import { webRequest, MINE_BASE } from "./common.js";

export const recycleList: McpTool = {
  name: "yuque_list_recycles",
  description: "列出回收站项目（需要 YUQUE_COOKIE + YUQUE_CTOKEN 环境变量，支持分页和 target_type 筛选）",

  inputSchema: {
    type: "object",
    properties: {
      offset: { type: "number", description: "分页偏移，默认 0" },
      limit: { type: "number", description: "每页数量，≤100，默认 50" },
      target_type: { type: "string", description: "类型筛选：Doc / Note / Repo" },
    },
  },

  async handler(args) {
    const offset = (args?.offset as number) ?? 0;
    const limit = Math.min((args?.limit as number) ?? 50, 100);
    const targetType = args?.target_type as string | undefined;

    let url = `${MINE_BASE}?offset=${offset}&limit=${limit}`;
    if (targetType) url += `&target_type=${targetType}`;

    const data = (await webRequest(url)) as { data?: { data?: Array<Record<string, unknown>>; total?: number } };
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