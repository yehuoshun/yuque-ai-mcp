/**
 * note/create — 创建小记
 *
 * 端点：POST /api/v2/notes
 * 职责：创建一条新小记
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const noteCreate: McpTool = {
  name: "yuque_create_note",
  description: "创建小记（body 支持纯文本或 Markdown）",

  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "小记内容（必填，纯文本或 Markdown）" },
    },
    required: ["body"],
  },

  async handler(args) {
    const body = args?.body as string;

    const url = `${YUQUE_API_BASE}/notes`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) return handleApiError(res, "创建小记");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};