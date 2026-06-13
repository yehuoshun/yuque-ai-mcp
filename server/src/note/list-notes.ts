/**
 * note/list — 获取小记列表
 *
 * 端点：GET /api/v2/notes
 * 职责：返回当前用户的小记列表（含置顶）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatNoteSummary } from "../common/format.js";


export const noteList: McpTool = {
  name: "yuque_list_notes",
  description: "List current user's notes (includes pinned notes, supports status filter and pagination)",

  inputSchema: {
    type: "object",
    properties: {
      status: { type: "number", description: "Status filter: 0=active, 9=deleted" },
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Page size, default 20" },
    },
  },

  async handler(args) {
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const status = args?.status as number | undefined;
    const page = (args?.page as number) ?? 1;
    const limit = (args?.limit as number) ?? 20;

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (status !== undefined) params.set("status", String(status));

    const url = `${cfg.api_base}/notes?${params}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": cfg.token },
    });

    if (!res.ok) return handleApiError(res, "获取小记列表");

    const data = await res.json();
    const notes = data?.data?.notes || [];
    const pinNotes = data?.data?.pin_notes || [];
    const formatted = {
      pin_notes: pinNotes.map(formatNoteSummary),
      notes: notes.map(formatNoteSummary),
    };
    const result = raw
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(formatted, null, 2);
    return {
      content: [{ type: "text" as const, text: result }],
    };
  },
};