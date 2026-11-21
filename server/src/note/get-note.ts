/**
 * note/get — 获取小记详情
 *
 * 端点：GET /api/v2/notes/:id
 * 职责：返回小记完整内容
 */

import type { McpTool } from "../common/types.js";
import { apiGet } from "../common/api-client.js";
import { reqId, optionalBoolean, toIdNum } from "../common/validate.js";
import { formatNote, handleApiCall } from "../common/format.js";


export const noteGet: McpTool = {
  name: "yuque_get_note",
  description: "Get note detail. GET /notes/:id. 详见 references/api/note_api.md",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: ["string", "number"], description: "Note ID (required). number 或数字字符串都接受" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    // @validate
    const __v = reqId(args?.note_id, "note_id")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const noteId = toIdNum(args?.note_id);

    const data = await apiGet(`/notes/${noteId}`, undefined, "Get note");
    return handleApiCall(data, formatNote, raw);
  },
};