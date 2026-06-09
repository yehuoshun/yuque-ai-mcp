/**
 * user/user — 获取当前 Token 的用户详情
 *
 * 端点：GET /api/v2/user
 * 职责：返回当前 Token 对应的用户完整信息
 */

import type { McpTool } from "../types.js";
import { handleApiError } from "../errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

interface YuqueUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  description: string | null;
}

export const userGet: McpTool = {
  name: "yuque_get_user",
  description: "获取当前 Token 的用户详情（id、login、name、avatar_url、books_count、description 等）",

  async handler() {
    const res = await fetch(`${YUQUE_API_BASE}/user`, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取用户信息");

    const { data } = (await res.json()) as { data: YuqueUser };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};