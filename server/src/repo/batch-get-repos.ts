/**
 * repo/batch-get — 批量获取知识库详情
 *
 * 并发 GET /api/v2/repos/:book_id
 * 只读操作，不涉及写
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";


export const repoBatchGet: McpTool = {
  name: "yuque_batch_get_repos",
  description: "Batch get repository details (concurrent GET, read-only, max 20 repos)",

  inputSchema: {
    type: "object",
    properties: {
      ids: {
        type: "string",
        description: "Repository IDs as JSON array, e.g. [123,456] or [\"group/repo-a\",\"group/repo-b\"] (required, max 20)",
      },
    },
    required: ["ids"],
  },

  async handler(args) {
    const idsRaw = args?.ids as string;

    const v = requiredString(idsRaw, "ids");
    if (v) return v;

    let ids: (string | number)[];
    try {
      ids = JSON.parse(idsRaw);
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "ids 必须是合法 JSON 数组 / ids must be a valid JSON array",
          hint: "zh/en",
        }, null, 2) }],
        isError: true,
      };
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "ids 不能为空数组 / ids must be a non-empty array",
          hint: "zh/en",
        }, null, 2) }],
        isError: true,
      };
    }
    if (ids.length > 20) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "ids 最多 20 个 / ids max 20",
          hint: "zh/en",
        }, null, 2) }],
        isError: true,
      };
    }

    const results = await Promise.all(
      ids.map((id) =>
        apiGet(`/repos/${encodeURIComponent(String(id))}`, undefined, `Get repo ${id}`).then((data: unknown) => {
          if (isErrorResult(data)) return { id, error: true, detail: data };
          return { id, ok: true, data };
        })
      )
    );

    const output: Record<string, unknown> = {};
    const errors: Array<{ id: string | number; detail: unknown }> = [];

    for (const r of results) {
      if (r.error) {
        errors.push({ id: r.id as string | number, detail: (r as any).detail });
      } else if (r.ok && r.data) {
        output[String(r.id)] = (r.data as any)?.data ?? r.data;
      }
    }

    const response: Record<string, unknown> = { total: ids.length, ok: Object.keys(output).length };
    if (Object.keys(output).length > 0) response.repos = output;
    if (errors.length > 0) response.errors = errors;

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  },
};