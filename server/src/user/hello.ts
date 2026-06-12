/**
 * user/hello — 心跳检测
 *
 * 端点：GET /api/v2/hello
 * 职责：测试 Token 有效性和 API 连通性
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";


export const userHello: McpTool = {
  name: "yuque_hello",
  description: "心跳检测：测试语雀 API Token 是否有效，返回欢迎消息（含 message 字段）",

  async handler() {
    const cfg = loadConfig();
    const res = await fetch(`${cfg.api_base}/hello`, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "心跳检测");

    const { data } = (await res.json()) as { data: { message: string } };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};