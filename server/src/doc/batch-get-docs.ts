/**
 * doc/batch-get — 批量获取文档详情
 *
 * 并发 GET /api/v2/repos/:book_id/docs/:id
 * 只读操作，不涉及写
 */

import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";
import { formatDoc, wrapResult } from "../common/format.js";


export const docBatchGet: McpTool = {
  name: "yuque_batch_get_docs",
  description: "Batch get document details (concurrent GET, read-only, max 20). 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Repository ID (numeric) or namespace like group/book_slug (required, shared for all docs)",
      },
      ids: {
        type: "string",
        description: "Document IDs as JSON array, e.g. [123,456] or [\"slug-a\",\"slug-b\"] (required, max 20)",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON (default false, returns trimmed fields)",
      },
    },
    required: ["book_id", "ids"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const idsRaw = args?.ids as string;
    const raw = args?.raw as boolean | undefined;

    // 校验
    const v = check(
      requiredString(bookId, "book_id"),
      requiredString(idsRaw, "ids"),
    );
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

    // 并发获取
    const results = await Promise.all(
      ids.map((id) =>
        apiGet(`/repos/${bookId}/docs/${encodeURIComponent(String(id))}`, {
          raw: raw ? "1" : "0",
        }, `Get doc ${id}`).then((data: unknown) => {
          if (isErrorResult(data)) return { id, error: true, detail: data };
          return { id, ok: true, data };
        })
      )
    );

    // 组装结果
    const output: Record<string, unknown> = {};
    const errors: Array<{ id: string | number; detail: unknown }> = [];

    for (const r of results) {
      if (r.error) {
        errors.push({ id: r.id as string | number, detail: (r as any).detail });
      } else if (r.ok && r.data) {
        const rawData = (r.data as any)?.data ?? r.data;
        output[String(r.id)] = raw ? rawData : wrapResult(r.data, formatDoc, false);
      }
    }

    const response: Record<string, unknown> = { total: ids.length, ok: Object.keys(output).length };
    if (Object.keys(output).length > 0) response.docs = output;
    if (errors.length > 0) response.errors = errors;

    return {
      content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
    };
  },
};