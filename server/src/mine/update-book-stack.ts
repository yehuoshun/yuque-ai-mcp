/**
 * mine/update-book-stack — 移动知识库到指定分组（书架）
 *
 * 端点：PATCH /api/books/:book_id（Web API，Cookie 认证）
 * 职责：将指定知识库移动到目标分组（书架）下
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";

const BOOK_BASE = "https://www.yuque.com/api/books";

export const mineUpdateBookStack: McpTool = {
  name: "yuque_update_book_stack",
  description:
    "移动知识库到指定分组（书架）。需要 cookie+ctoken 认证。PATCH /api/books/:book_id。常用于将知识库从一个分组（如预废弃）移到另一个分组（如废弃）。",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "number",
        description: "知识库 ID（数字，必填）",
      },
      stack_id: {
        type: "number",
        description: "目标分组 ID（书架 ID，必填）",
      },
    },
    required: ["book_id", "stack_id"],
  },

  async handler(args?: Record<string, unknown>) {
    const bookId = args?.book_id as number | undefined;
    const stackId = args?.stack_id as number | undefined;

    if (!bookId) {
      return {
        content: [{ type: "text" as const, text: "错误：book_id 是必填参数" }],
        isError: true,
      };
    }
    if (!stackId) {
      return {
        content: [{ type: "text" as const, text: "错误：stack_id 是必填参数" }],
        isError: true,
      };
    }

    const result = await webRequest(`${BOOK_BASE}/${bookId}`, {
      method: "PATCH" as "PUT",
      body: { stack_id: stackId },
    });

    if (isErrorResult(result)) return result;

    const data = result as { data?: Record<string, unknown> };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              message: `知识库 ${bookId} 已移动到分组 ${stackId}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};