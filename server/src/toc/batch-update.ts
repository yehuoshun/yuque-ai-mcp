/**
 * toc/batch-update — 批量更新知识库目录
 *
 * Agent 出变更计划（ops），Tool 原样执行，零决策。
 * 纯 TOC 操作，跨库复制请用 yuque_copy_doc。
 * 端点：PUT /api/v2/repos/:book_id/toc
 *
 * op 执行逻辑在 common/toc-ops.ts。
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import {
  type TocOp,
  type OpResult,
  executeOp,
} from "../common/toc-ops.js";

export const tocBatchUpdate: McpTool = {
  name: "yuque_batch_update_toc",
  description: "Batch update repo TOC. Agent provides ops plan, tool executes only. createTitle auto-reuses existing dirs. appendNode/moveNode support target_title. ⚠️ Remove/move ops require confirm='RESTRUCTURE'. For cross-book copy, use yuque_copy_doc instead.",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Repository ID or namespace (required)",
      },
      ops: {
        type: "string",
        description: "JSON array of operations. Supported: createTitle, appendNode, removeNode, moveNode. createTitle auto-reuses existing dirs. appendNode/moveNode support target_title for name-based lookup.",
      },
      confirm: {
        type: "string",
        description: "Must be 'RESTRUCTURE' to proceed with any operation that modifies TOC.",
      },
    },
    required: ["book_id", "ops", "confirm"],
  },

  async handler(args) {
    const v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.ops, "ops"),
      requiredString(args?.confirm, "confirm"),
    );
    if (v) return v;

    const confirmVal = args?.confirm as string;
    if (confirmVal !== "RESTRUCTURE") {
      return {
        content: [{ type: "text" as const, text: "⚠️ 批量目录操作需二次确认，请将参数 `confirm` 设为 'RESTRUCTURE' 后重试" }],
        isError: true,
      };
    }

    const bookId = args?.book_id as string;

    let ops: TocOp[];
    try {
      ops = JSON.parse(args?.ops as string) as TocOp[];
      if (!Array.isArray(ops) || ops.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "INVALID_OPS", message: "ops 必须是非空 JSON 数组",
          }, null, 2) }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "INVALID_OPS", message: "ops 必须是有效的 JSON 数组",
        }, null, 2) }],
        isError: true,
      };
    }

    const results: OpResult[] = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        const result = await executeOp(op, bookId);
        results.push({ index: i, action: op.action, ...result });
      } catch (err) {
        results.push({
          index: i, action: op.action, success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        book_id: bookId,
        total: results.length,
        success,
        failed,
        results,
      }, null, 2) }],
    };
  },
};
