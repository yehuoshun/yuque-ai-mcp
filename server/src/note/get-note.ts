/**
 * note/get — 获取小记详情
 *
 * 端点：GET /api/v2/notes/:id
 * 职责：返回小记完整内容
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatNote, wrapResult } from "../common/format.js";


export const noteGet: McpTool = {
  name: "yuque_get_note",
  description: "Get note detail (returns full content including content.text/content.html)",

  inputSchema: {
    type: "object",
    properties: {
      note_id: { type: "number", description: "Note ID (required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["note_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const noteId = args?.note_id as number;

    const url = `${cfg.api_base}/notes/${noteId}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取小记详情");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatNote, raw) }],
    };
  },
};