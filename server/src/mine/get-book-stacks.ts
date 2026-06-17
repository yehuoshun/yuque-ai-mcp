/**
 * mine/book-stacks — 获取知识库分组（书架）列表
 *
 * 端点：GET /api/mine/book_stacks（Web API，Cookie 认证）
 * 职责：返回当前用户的知识库分组（书架），含每个分组下的知识库列表
 */

import type { McpTool } from "../common/types.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

export const mineBookStacks: McpTool = {
  name: "yuque_get_book_stacks",
  description: "获取当前用户的知识库分组（书架）列表，含每个分组下的知识库。需要 cookie+ctoken 认证。GET /api/mine/book_stacks",

  inputSchema: {
    type: "object",
    properties: {},
  },

  async handler() {
    const data = (await webRequest(`${MINE_BASE}/book_stacks`)) as {
      data?: Array<{
        id: number;
        name: string;
        rank: number;
        books?: Array<{
          id: number;
          type: string;
          slug: string;
          name: string;
          description: string;
          items_count: number;
        }>;
      }>;
    };

    const stacks = (data?.data || []).map((s) => ({
      id: s.id,
      name: s.name,
      rank: s.rank,
      books: (s.books || []).map((b) => ({
        id: b.id,
        type: b.type,
        slug: b.slug,
        name: b.name,
        description: b.description || "",
        items_count: b.items_count,
      })),
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ stacks }, null, 2),
        },
      ],
    };
  },
};