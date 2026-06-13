/**
 * note/update — 更新或删除小记
 *
 * 端点：PUT /api/v2/notes/:id
 * 职责：更新小记内容或软删除（status=9）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatNote, wrapResult } from "../common/format.js";


export const noteUpdate: McpTool = {
  name: "yuque_update_note",
  description: "Update or delete a note (body for content update, status=9 soft-deletes, status=0 restores)",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "Note ID (required)" },
      body: { type: "string", description: "New content (plain text or Markdown, unchanged if omitted)" },
      status: { type: "number", description: "Status: 0=active, 9=deleted (unchanged if omitted)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
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

    const url = `${cfg.api_base}/notes/${noteId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新小记");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatNote, raw) }],
    };
  },
};