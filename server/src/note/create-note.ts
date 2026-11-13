/**
 * note/create — 创建小记
 *
 * 端点：POST /api/v2/notes
 * 职责：创建一条新小记
 */

import type { McpTool } from "../common/types.js";
import { apiPost } from "../common/api-client.js";
import { requiredString, optionalBoolean } from "../common/validate.js";
import { formatNote, handleApiCall } from "../common/format.js";


export const noteCreate: McpTool = {
  name: "yuque_create_note",
  description: "Create a note (short memo). Returns id, slug, note_url. POST /notes. 详见 references/api/note_api.md",

  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "Note body content (required, plain text or Markdown)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["body"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.body, "body")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const body = args?.body as string;

    const data = await apiPost("/notes", { body }, "Create note");
    return handleApiCall(data, formatNote, raw);
  },
};