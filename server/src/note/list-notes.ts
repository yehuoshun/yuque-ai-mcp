/**
 * note/list — 获取小记列表
 *
 * 端点：GET /api/v2/notes
 * 职责：返回当前用户的小记列表（含置顶）
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { formatNoteSummary } from "../common/format.js";


export const noteList: McpTool = {
  name: "yuque_list_notes",
  description: "List current user's notes",

  inputSchema: {
    type: "object",
    properties: {
      status: { type: "number", description: "Status filter: 0=active, 9=deleted" },
      page: { type: "number", description: "Page number, default 1" },
      limit: { type: "number", description: "Page size, default 20" },
    },
  },

  async handler(args) {
    const raw = args?.raw as boolean | undefined;
    const status = args?.status as number | undefined;
    const page = (args?.page as number) ?? 1;
    const limit = (args?.limit as number) ?? 20;

    const params: Record<string, string> = {
      page: String(page),
      limit: String(limit),
    };
    if (status !== undefined) params.status = String(status);

    const data = await apiGet("/notes", params, "List notes");
    if (isErrorResult(data)) return data;

    const notes = (data as { data?: { notes?: unknown[]; pin_notes?: unknown[] } })?.data;
    const formatted = {
      pin_notes: (notes?.pin_notes ?? []).map((n) => formatNoteSummary(n as Parameters<typeof formatNoteSummary>[0])),
      notes: (notes?.notes ?? []).map((n) => formatNoteSummary(n as Parameters<typeof formatNoteSummary>[0])),
    };
    const result = raw ? JSON.stringify(data, null, 2) : JSON.stringify(formatted, null, 2);
    return {
      content: [{ type: "text" as const, text: result }],
    };
  },
};