/**
 * base/hello — 心跳检测
 *
 * 端点：GET /api/v2/hello
 * 职责：测试 Token 有效性和 API 连通性
 */

import type { McpTool } from "../types.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const helloCheck: McpTool = {
  name: "yuque_hello",
  description: "心跳检测：测试语雀 API Token 是否有效，返回欢迎消息",

  async handler() {
    const res = await fetch(`${YUQUE_API_BASE}/hello`, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`心跳检测失败 (${res.status}): ${body}`);
    }

    const { data } = (await res.json()) as { data: { message: string } };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};