/**
 * mine/create-book-stack — 创建知识库分组（书架），并设定名称
 *
 * 端点：
 *   1) POST /api/mine/book_stack          创建（body { name, target_rank }，name 会被忽略）
 *   2) PUT  /api/book_stacks/{stack_id}   改名（body { name, type: "user_books" }）
 *
 * ⚠️ 语雀设计：create 接口不能指定名字，只会生成默认名「新建分组」。
 * 想指定名称必须在 create 之后用 edit(PUT) 改名。故本工具内部自动补一次改名。
 *
 * 端点来源：历史实现 server/src/tools/book-stacks.ts（commit e67d284）。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE, BOOK_STACKS_BASE } from "./common.js";

export const mineCreateBookStack: McpTool = {
  name: "yuque_create_book_stack",
  description:
    "创建知识库分组（书架）并设定名称。需要 cookie+ctoken 认证。语雀 create 不能直接指定名字，本工具内部 create 后自动 edit 改名。body {name, target_rank}。",

  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "分组名称（必填）" },
      target_rank: { type: "number", description: "目标排序位（可选，默认 0）" },
    },
    required: ["name"],
  },

  async handler(args?: Record<string, unknown>) {
    const name = args?.name as string | undefined;
    if (!name) {
      return {
        content: [{ type: "text" as const, text: "错误：name 是必填参数" }],
        isError: true,
      };
    }
    const rank = (args?.target_rank as number) ?? 0;

    // 1) 创建（语雀只给默认名）
    const created = await webRequest(`${MINE_BASE}/book_stack`, {
      method: "POST" as const,
      body: { name, target_rank: rank },
    });
    if (isErrorResult(created)) return created;

    const stackId = (created as { data?: { id?: number } })?.data?.id;

    // 2) 若创建成功拿到 id，则补一次改名，使 name 真正生效
    let renamed = false;
    let renameError: unknown = null;
    if (stackId) {
      const rn = await webRequest(`${BOOK_STACKS_BASE}/${stackId}`, {
        method: "PUT" as const,
        body: { name, type: "user_books" },
      });
      if (isErrorResult(rn)) {
        renameError = rn;
      } else {
        renamed = true;
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              stack_id: stackId ?? null,
              name,
              renamed,
              ...(renameError ? { rename_warning: "创建成功但改名失败", rename_error: renameError } : {}),
              created_raw: created,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
