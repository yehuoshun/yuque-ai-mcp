/**
 * user/hello — 心跳检测
 *
 * 端点：GET /api/v2/hello
 * 职责：测试 Token 有效性和 API 连通性
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { formatHello, handleApiCall } from "../common/format.js";


export const userHello: McpTool = {
  name: "yuque_hello",
  description: "Health check — verify Yuque API token validity. GET /hello. 详见 references/api/user_api.md",

  async handler() {
    const data = await apiGet("/hello");
    return handleApiCall(data, formatHello);
  },
};