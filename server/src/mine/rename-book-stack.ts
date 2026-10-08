/**
 * mine/rename-book-stack — 重命名知识库分组（书架）
 *
 * 端点：PUT /api/book_stacks/{stack_id}（Web API，Cookie 认证）
 * body: { name, type: "user_books" }
 *
 * 端点来源：历史实现 server/src/tools/book-stacks.ts（commit e67d284）的「改名」。
 * 语雀 create 接口无法直接指定 name（只能拿默认名），故改名须单独走本接口。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { BOOK_STACKS_BASE } from "./common.js";

export const mineRenameBookStack: McpTool = {
  name: "yuque_rename_book_stack",
  description:
    "重命名知识库分组（书架）。需要 cookie+ctoken 认证。PUT /api/book_stacks/{stack_id}，body {name, type:'user_books'}。",

  inputSchema: {
    type: "object",
    properties: {
      stack_id: { type: "number", description: "分组 ID（书架 ID，必填）" },
      name: { type: "string", description: "新名称（必填）" },
    },
    required: ["stack_id", "name"],
  },

  async handler(args?: Record<string, unknown>) {
    const stackId = args?.stack_id as number | undefined;
    const name = args?.name as string | undefined;

    if (!stackId) {
      return {
        content: [{ type: "text" as const, text: "错误：stack_id 是必填参数" }],
        isError: true,
      };
    }
    if (!name) {
      return {
        content: [{ type: "text" as const, text: "错误：name 是必填参数" }],
        isError: true,
      };
    }

    const result = await webRequest(`${BOOK_STACKS_BASE}/${stackId}`, {
      method: "PUT" as const,
      body: { name, type: "user_books" },
    });

    if (isErrorResult(result)) return result;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { success: true, message: `分组 ${stackId} 已重命名为「${name}」`, raw: result },
            null,
            2,
          ),
        },
      ],
    };
  },
};
