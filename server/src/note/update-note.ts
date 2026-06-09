/**
 * note/update — 更新小记
 *
 * 端点：PUT /api/v2/notes/:id
 * 职责：更新小记内容
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const noteUpdate: McpTool = {
  name: "yuque_update_note",
  description: "更新小记内容（note_id 必填，body 支持纯文本或 Markdown）",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "小记 ID（必填）" },
      body: { type: "string", description: "新内容（必填，纯文本或 Markdown）" },
    },
    required: ["note_id", "body"],
  },

  async handler(args) {
    const noteId = args?.note_id as number;
    const body = args?.body as string;

    const url = `${YUQUE_API_BASE}/notes/${noteId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) return handleApiError(res, "更新小记");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};