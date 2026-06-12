/**
 * resource/update — 更新文档中的结构化资源（画板）
 *
 * 端点：PUT /api/v2/yfm/boards
 * 职责：修改文档中已有的思维导图/流程图/架构图的 DSL 数据
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";

export const boardUpdate: McpTool = {
  name: "yuque_update_board",
  description: "更新文档中的画板资源（思维导图/流程图/架构图），text 和 dsl 二选一，text 更新文本 DSL，dsl 更新 JSON DSL",

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
        description: "画板资源 ID（必填，从 board://<resource_id> 中提取）",
      },
      text: {
        type: "string",
        description: "新的文本 DSL 内容（与 dsl 二选一）",
      },
      dsl: {
        type: "string",
        description: "新的 JSON DSL 对象（与 text 二选一），会作为 JSON 发送",
      },
    },
    required: ["resource_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const docId = args?.doc_id as number | undefined;
    const url = args?.url as string | undefined;
    const resourceId = args?.resource_id as string;
    const text = args?.text as string | undefined;
    const dslRaw = args?.dsl as string | undefined;

    if (!docId && !url) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "请提供 doc_id 或 url" }, null, 2) },
        ],
        isError: true,
      };
    }

    if (!text && !dslRaw) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "请提供 text 或 dsl（二选一）" }, null, 2) },
        ],
        isError: true,
      };
    }

    const payload: Record<string, unknown> = {
      resource_type: "board",
      src: resourceId,
    };
    if (docId) payload.doc_id = docId;
    if (url) payload.url = url;

    if (text !== undefined) {
      payload.text = text;
    } else if (dslRaw !== undefined) {
      try {
        payload.dsl = JSON.parse(dslRaw);
      } catch {
        payload.dsl = dslRaw;
      }
    }

    const apiUrl = `${cfg.api_base}/yfm/boards`;
    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新画板资源");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};