/**
 * doc/get — 获取文档详情
 *
 * 端点：GET /api/v2/repos/docs/:id
 * 职责：获取文档完整内容（正文、格式、元信息等）
 *
 * id 支持文档 ID 或 slug。数据表类型支持 page_size/page 分页。
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const docGet: McpTool = {
  name: "yuque_get_doc",
  description: "获取文档详情（id 支持文档 ID 或 slug，返回正文 body/body_html/body_lake 等完整内容）",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "文档 ID 或 slug（必填）" },
      page_size: { type: "number", description: "数据表分页大小，1-200，默认 100" },
      page: { type: "number", description: "数据表页码，≥1，默认 1" },
    },
    required: ["id"],
  },

  async handler(args) {
    const id = args?.id as string;
    const pageSize = (args?.page_size as number) ?? 100;
    const page = (args?.page as number) ?? 1;

    const params = new URLSearchParams();
    params.set("page_size", String(Math.min(pageSize, 200)));
    params.set("page", String(page));

    const url = `${YUQUE_API_BASE}/repos/docs/${id}?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取文档详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};