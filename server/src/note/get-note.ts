/**
 * note/get — 获取小记详情
 *
 * 端点：GET /api/v2/notes/:id
 * 职责：返回小记完整内容
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const noteGet: McpTool = {
  name: "yuque_get_note",
  description: "获取小记详情（返回完整内容含 content.text/content.html）",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "小记 ID（必填）" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    const noteId = args?.note_id as number;

    const url = `${YUQUE_API_BASE}/notes/${noteId}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": YUQUE_TOKEN },
    });

    if (!res.ok) return handleApiError(res, "获取小记详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};