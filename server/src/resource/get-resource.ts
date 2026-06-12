/**
 * resource/get — 获取文档中的结构化资源（画板）
 *
 * 端点：GET /api/v2/yfm/boards
 * 职责：读取文档中已有的思维导图/流程图/架构图的 JSON DSL 数据
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

export const resourceGet: McpTool = {
  name: "yuque_get_resource",
  description: "获取文档中的画板资源（思维导图/流程图/架构图），返回 JSON DSL 和摘要统计",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: {
        type: "number",
        description: "文档 ID（与 url 二选一）",
      },
      url: {
        type: "string",
        description: "文档 URL（与 doc_id 二选一）",
      },
      resource_id: {
        type: "string",
        description: "画板资源 ID（必填，从 board://<resource_id> 中提取，只传 ID 部分）",
      },
    },
    required: ["resource_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const resourceId = args?.resource_id as string;

    if (!docId && !url) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url" }, null, 2) },
        ],
        isError: true,
      };
    }

    const params = new URLSearchParams();
    params.set("resource_type", "board");
    params.set("src", resourceId);
    if (docId) params.set("doc_id", String(docId));
    if (url) params.set("url", url);

    const apiUrl = `${cfg.api_base}/yfm/boards?${params}`;
    const res = await fetch(apiUrl, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取画板资源");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};
