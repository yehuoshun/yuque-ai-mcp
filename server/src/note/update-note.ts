/**
 * note/update — 更新或删除小记
 *
 * 端点：PUT /api/v2/notes/:id
 * 职责：更新小记内容或软删除（status=9）
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { apiPut } from "../common/api-client.js";
import { positiveInt, optionalBoolean } from "../common/validate.js";
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
    // @validate
    const __v = positiveInt(args?.note_id, "note_id")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
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

    // 语雀 PUT /notes 要求 html/source/abstract 必填：删除（status=9）且未传 body 时自动补全；
    // 恢复（status=0）且未传 body 时直接报错（原内容已被删除占位覆盖，无法自动回填）
    if (status === 9 && body === undefined) {
      payload.html = "<p>已删除</p>";
      payload.source = "已删除";
      payload.abstract = "已删除";
    }
    if (status === 0 && body === undefined) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "恢复小记需要 body 参数（语雀 API 要求 html/source/abstract 必填，且软删后原内容已被覆盖，无法自动回填） / restoring a note requires body (Yuque API mandates html/source/abstract; original content was overwritten on delete)" }, null, 2) }],
        isError: true,
      };
    }

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