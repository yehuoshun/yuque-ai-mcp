/**
 * mine/sort-book-stack — 排序分组（书架）内知识库
 *
 * 端点：PUT /api/mine/book_stack/move（Web API，Cookie 认证）
 * 职责：按传入的有序 targetBookIds 重新排列分组内的知识库。
 * 语雀无独立排序接口，实测 move 接口传有序 book_ids 列表时，
 * 顺序即最终 rank（2026-08-31 验证）。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

export const mineSortBookStack: McpTool = {
  name: "yuque_sort_book_stack",
  description:
    "排序分组（书架）内知识库顺序。需要 cookie+ctoken 认证。PUT /api/mine/book_stack/move，传有序 targetBookIds（数组顺序即最终排序）。常用于把分组内知识库按期望顺序重排。",

  inputSchema: {
    type: "object",
    properties: {
      stack_id: {
        type: "number",
        description: "目标分组 ID（书架 ID，必填）",
      },
      book_ids: {
        type: "array",
        items: { type: "number" },
        description: "排序后的知识库 ID 数组（按期望顺序排列，必填）",
      },
    },
    required: ["stack_id", "book_ids"],
  },

  async handler(args?: Record<string, unknown>) {
    const stackId = args?.stack_id as number | undefined;
    const bookIds = args?.book_ids as number[] | undefined;

    if (!stackId) {
      return {
        content: [{ type: "text" as const, text: "错误：stack_id 是必填参数" }],
        isError: true,
      };
    }
    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return {
        content: [{ type: "text" as const, text: "错误：book_ids 是必填参数，且不能为空数组" }],
        isError: true,
      };
    }

    const result = await webRequest(`${MINE_BASE}/book_stack/move`, {
      method: "PUT" as const,
      body: { targetStackId: stackId, targetBookIds: bookIds },
    });

    if (isErrorResult(result)) return result;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              message: `分组 ${stackId} 内 ${bookIds.length} 个知识库已按传入顺序排序`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};