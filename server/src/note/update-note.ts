/**
 * note/update — 更新或删除小记
 *
 * 端点：PUT /api/v2/notes/:id
 * 职责：更新小记内容或软删除（status=9）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const noteUpdate: McpTool = {
  name: "yuque_update_note",
  description: "更新或删除小记（body 更新内容，status 设为 9 即软删除，设为 0 恢复）",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "小记 ID（必填）" },
      body: { type: "string", description: "新内容（纯文本或 Markdown，不填则保持不变）" },
      status: { type: "number", description: "状态：0=正常 / 9=删除（不填则不变）" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    const noteId = args?.note_id as number;
    const body = args?.body as string | undefined;
    const status = args?.status as number | undefined;

    const payload: Record<string, unknown> = {};
    if (body !== undefined) {
      payload.body = body;
      payload.html = `<p>${body}</p>`;
      payload.source = body;
      payload.abstract = body.substring(0, 200);
    }
    if (status !== undefined) payload.status = status;

    if (Object.keys(payload).length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "至少需要传 body 或 status" }, null, 2) }],
        isError: true,
      };
    }

    const url = `${YUQUE_API_BASE}/notes/${noteId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新小记");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};