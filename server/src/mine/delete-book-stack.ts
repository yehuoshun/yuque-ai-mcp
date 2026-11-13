/**
 * mine/delete-book-stack — 删除知识库分组（书架）
 *
 * 端点：DELETE /api/book_stacks/{stack_id}（Web API，Cookie 认证）
 *
 * ⚠️ 删除不可恢复。分组内若有知识库，语雀通常会拒绝或要求先清空。
 * 端点来源：与「改名」PUT /api/book_stacks/{stack_id} 同资源，
 * 按 REST 规律推断为 DELETE 同路径。删除后回查 book_stacks 确认消失。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE, BOOK_STACKS_BASE } from "./common.js";

export const mineDeleteBookStack: McpTool = {
  name: "yuque_delete_book_stack",
  description:
    "删除知识库分组（书架）。⚠️ 不可恢复！需传 confirm='DELETE' 二次确认。DELETE /api/book_stacks/{stack_id}。分组内须先清空知识库。",

  inputSchema: {
    type: "object",
    properties: {
      stack_id: { type: "number", description: "要删除的分组 ID（书架 ID，必填）" },
      confirm: { type: "string", description: "危险操作二次确认，必须传 'DELETE'" },
    },
    required: ["stack_id", "confirm"],
  },

  async handler(args?: Record<string, unknown>) {
    const stackId = args?.stack_id as number | undefined;
    const confirm = args?.confirm as string | undefined;

    if (!stackId) {
      return {
        content: [{ type: "text" as const, text: "错误：stack_id 是必填参数" }],
        isError: true,
      };
    }
    if (confirm !== "DELETE") {
      return {
        content: [
          {
            type: "text" as const,
            text: "危险操作：删除分组不可恢复，需传 confirm='DELETE' 确认",
          },
        ],
        isError: true,
      };
    }

    const result = await webRequest(`${BOOK_STACKS_BASE}/${stackId}`, {
      method: "DELETE" as const,
      body: { type: "user_books" },
    });

    if (isErrorResult(result)) return result;

    // 回查确认分组已消失
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(1500);
      const stacks = await webRequest(`${MINE_BASE}/book_stacks`);
      if (!isErrorResult(stacks)) {
        const data =
          (stacks as { data?: Array<{ id: number }> })?.data ||
          (stacks as { stacks?: Array<{ id: number }> })?.stacks ||
          [];
        if (!data.some((s) => s.id === stackId)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: true, message: `分组 ${stackId} 已删除`, raw: result },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `删除后回查：分组 ${stackId} 仍存在（已重试 3 次）。接口返回：${JSON.stringify(result)}`,
        },
      ],
      isError: true,
    };
  },
};
