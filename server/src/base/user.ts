/**
 * base/user — 获取当前用户信息
 *
 * 端点：GET /api/v2/user
 * 职责：返回当前 Token 对应的用户基本信息
 */

import type { McpTool } from "../types.js";

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
  description: "获取当前语雀用户信息（id、login、name、avatar_url、description）",

  async handler() {
    const res = await fetch(`${YUQUE_API_BASE}/user`, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`获取用户信息失败 (${res.status}): ${body}`);
    }

    const { data } = (await res.json()) as { data: YuqueUser };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};