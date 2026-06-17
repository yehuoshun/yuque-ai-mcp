/**
 * note/update — 更新或删除小记
 *
 * 端点：PUT /api/v2/notes/:id
 * 职责：更新小记内容或软删除（status=9）
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { apiPut, isErrorResult } from "../common/api-client.js";
import { formatNote, handleApiCall } from "../common/format.js";


export const noteUpdate: McpTool = {
  name: "yuque_update_note",
  description: "Update or delete a note. ⚠️ Deleting (status=9) requires confirm='DELETE'. PUT /notes/:id. 详见 references/api/note_api.md",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "Note ID (required)" },
      body: { type: "string", description: "New content (plain text or Markdown, unchanged if omitted)" },
      status: { type: "number", description: "Status: 0=active, 9=deleted (unchanged if omitted)" },
      confirm: confirmationParam.confirm,
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    const raw = args?.raw as boolean | undefined;
    const noteId = args?.note_id as number;
    const body = args?.body as string | undefined;
    const status = args?.status as number | undefined;

    if (status === 9) {
      const confirmed = checkConfirmation(args);
      if (confirmed) return confirmed;
    }

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

    const data = await apiPut(`/notes/${noteId}`, payload, "Update note");
    return handleApiCall(data, formatNote, raw);
  },
};