/**
 * user/user — 获取当前 Token 的用户详情
 *
 * 端点：GET /api/v2/user
 * 职责：返回当前 Token 对应的用户完整信息
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

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
    const cfg = loadConfig();
    const res = await fetch(`${cfg.api_base}/user`, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取用户信息");

    const { data } = (await res.json()) as { data: YuqueUser };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};