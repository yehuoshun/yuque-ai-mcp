/**
 * note/list — 获取小记列表
 *
 * 端点：GET /api/v2/notes
 * 职责：返回当前用户的小记列表（含置顶）
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatNoteSummary, wrapResult } from "../common/format.js";


export const noteList: McpTool = {
  name: "yuque_list_notes",
  description: "获取当前用户的小记列表（含置顶小记，支持 status 过滤和分页）",

  inputSchema: {
    type: "object",
    properties: {
      status: { type: "number", description: "状态过滤：0=正常 / 9=已删除" },
      page: { type: "number", description: "页码，默认 1" },
      limit: { type: "number", description: "每页数量，默认 20" },
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
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatNoteSummary, raw) }],
    };
  },
};