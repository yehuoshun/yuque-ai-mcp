/**
 * mine/book-stacks — 获取知识库分组（书架）列表
 *
 * 端点：GET /api/mine/book_stacks（Web API，Cookie 认证）
 * 职责：返回当前用户的知识库分组（书架），含每个分组下的知识库列表
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { MINE_BASE } from "./common.js";

/**
 * 单个分组（书架）能返回的知识库数量上限。
 *
 * 语雀 Web 端对分组内的知识库有硬上限 200：GET /api/mine/book_stacks 的 books
 * 数组超过 200 个即被截断为 200，网页端侧栏同样只展示 200 个，其余「默认隐藏」。
 * 实测（2026-11-22）：分组「编程技术」实有 789 个知识库（GET /api/books?stack_id
 * 能列全，v2 OpenAPI 同源），book_stacks 只回 200 个；加 limit / page / per_page
 * 参数都不改变结果，说明是服务端硬上限而非分页。
 */
export const STACK_BOOKS_CAP = 200;

export const mineBookStacks: McpTool = {
  name: "yuque_get_book_stacks",
  description:
    "获取当前用户的知识库分组（书架）列表，含每个分组下的知识库。需要 cookie+ctoken 认证。" +
    "GET /api/mine/book_stacks。⚠️ 单个分组的 books 最多只返回 200 个（语雀上限，超出部分默认隐藏），需要全量请用 yuque_list_repos 按 stack_id 拉",

  inputSchema: {
    type: "object",
    properties: {},
  },

  async handler() {
    const result = await webRequest(`${MINE_BASE}/book_stacks`);
    if (isErrorResult(result)) return result;

    const data = result as {
      data?: Array<{
        id: number;
        name: string;
        rank: number;
        books?: Array<{
          id: number;
          type: string;
          slug: string;
          name: string;
          description: string;
          items_count: number;
        }>;
      }>;
    };

    const stacks = (data?.data || []).map((s) => ({
      id: s.id,
      name: s.name,
      rank: s.rank,
      books: (s.books || []).map((b) => ({
        id: b.id,
        type: b.type,
        slug: b.slug,
        name: b.name,
        description: b.description || "",
        items_count: b.items_count,
      })),
    }));

    // 触到上限的分组很可能还有被隐藏的知识库：必须显式告知调用方，
    // 否则「接口只回 200 个」会被误读成「该分组只有 200 个知识库」。
    const capped = stacks
      .filter((s) => s.books.length >= STACK_BOOKS_CAP)
      .map((s) => ({ id: s.id, name: s.name, books_returned: s.books.length }));

    const warnings = capped.map(
      (s) =>
        `分组 ${s.id}「${s.name}」返回 ${s.books_returned} 个知识库，已达语雀单分组上限 ${STACK_BOOKS_CAP}，超出部分默认隐藏；` +
        `要全量清单请用 GET /api/books?stack_id=${s.id}（v2 OpenAPI，对应 yuque_list_repos）`,
    );

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              stacks,
              ...(warnings.length > 0 ? { warnings, possibly_truncated: capped } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
