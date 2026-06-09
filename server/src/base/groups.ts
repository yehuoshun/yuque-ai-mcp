/**
 * base/groups — 获取用户所属的团队列表
 *
 * 端点：GET /api/v2/users/:id/groups
 * 职责：获取指定用户加入的所有团队
 */

import type { McpTool } from "../types.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

interface Group {
  id: number;
  type: string;
  login: string;
  name: string;
  avatar_url: string;
  books_count: number;
  public_books_count: number;
  members_count: number;
  public: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export const userGroups: McpTool = {
  name: "yuque_get_user_groups",
  description: "获取用户所属的团队列表（支持 offset/limit 分页，limit 上限 100）",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "number", description: "用户 ID（必填）" },
      offset: { type: "number", description: "分页偏移" },
      limit: { type: "number", description: "每页条数，上限 100" },
    },
    required: ["id"],
  },

  async handler(args) {
    const id = args?.id as number;
    const offset = (args?.offset as number) ?? 0;
    const limit = (args?.limit as number) ?? 100;

    const url = `${YUQUE_API_BASE}/users/${id}/groups?offset=${offset}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`获取用户团队失败 (${res.status}): ${body}`);
    }

    const { data } = (await res.json()) as { data: Group[] };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};