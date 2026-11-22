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
 * 单个分组（书架）单次能返回的知识库数量窗口。
 *
 * GET /api/mine/book_stacks 的每个分组 books 数组在服务端被截到 200 条，超出部分
 * 不返回，网页端侧栏同样只展示 200 个（语雀「超 200 默认隐藏」）；补 limit / page /
 * per_page 参数都不改变结果。
 *
 * 实测（2026-11-22）：分组「编程技术」真实 426 个知识库（账号全站 789 个库），
 * 该接口恒回 200 条。从组里移走库后窗口会自动补位，删掉新库后先前被挤出的库自己
 * 回到列表 —— 说明第 201 个库一直在组里、只是不返回，**这是滑动窗口而非容量上限**。
 * 因此把组拆到 200 以内是为了「让库全部可见」，不是为了「让组装得下」。
 *
 * 拿全量组内清单不能靠 GET /api/books?stack_id=<id>：该参数实测被忽略（仍返回全站
 * 789 条），且 /api/books 的 stack_id 字段陈旧（645/789 为 null），不能用来判归属。
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
        `分组 ${s.id}「${s.name}」返回 ${s.books_returned} 个知识库，已触到语雀单次返回窗口 ${STACK_BOOKS_CAP}：该组真实库数可能更多，超出部分既不返回、网页端也看不到；` +
        `想让库全部可见请把该组拆到 ${STACK_BOOKS_CAP} 个以内（注意 GET /api/books?stack_id 过滤无效且 stack_id 字段陈旧，拿不到全量组内清单）`,
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
