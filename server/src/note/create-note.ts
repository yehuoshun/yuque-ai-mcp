/**
 * note/create — 创建小记
 *
 * 端点：POST /api/v2/notes
 * 职责：创建一条新小记
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatNote, wrapResult } from "../common/format.js";


export const noteCreate: McpTool = {
  name: "yuque_create_note",
  description: "Create a note (body supports plain text or Markdown)",

  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "Note body content (required, plain text or Markdown)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["body"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const body = args?.body as string;

    const url = `${cfg.api_base}/notes`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) return handleApiError(res, "创建小记");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatNote, raw) }],
    };
  },
};