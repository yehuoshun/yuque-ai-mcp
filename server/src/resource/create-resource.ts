/**
 * resource/create — 在文档中创建结构化资源（画板）
 *
 * 端点：POST /api/v2/yfm/boards
 * 职责：在文档中插入思维导图/流程图/架构图
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

export const resourceCreate: McpTool = {
  name: "yuque_create_resource",
  description: "在文档中创建画板资源（思维导图/流程图/架构图），需传 type 和 DSL 文本内容",

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
      type: {
        type: "string",
        description: "画板类型（必填）：mindmap=思维导图 / flowchart=流程图 / architecturediagram=架构图",
      },
      dsl: {
        type: "string",
        description: "画板文本 DSL 内容（必填），格式取决于 type",
      },
      insert_after_lake_id: {
        type: "string",
        description: "插入到指定 Lake 节点之后，不填则追加到文档末尾",
      },
    },
    required: ["type", "dsl"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const type = args?.type as string;
    const dsl = args?.dsl as string;
    const insertAfter = args?.insert_after_lake_id as string | undefined;

    if (!docId && !url) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url" }, null, 2) },
        ],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = {
      resource_type: "board",
      type,
      dsl,
    };
    if (docId) payload.doc_id = docId;
    if (url) payload.url = url;
    if (insertAfter) payload.insert_after_lake_id = insertAfter;

    const apiUrl = `${cfg.api_base}/yfm/boards`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "创建画板资源");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};
