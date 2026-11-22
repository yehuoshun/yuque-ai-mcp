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
 * 单个分组（书架）单次最多返回的知识库条数 —— **返回窗口**，不是容量上限。
 *
 * GET /api/mine/book_stacks 的每个分组 books 数组在服务端被截到 200 条，超出部分
 * 不返回，网页端侧栏同样只展示 200 个（语雀「超 200 默认隐藏」）；补 limit / page /
 * per_page / books_offset / books_limit 参数都不改变结果，响应里也没有
 * total / count / has_more 字段。
 *
 * 实测（2026-11-22）：分组「编程技术」真实 426 个知识库（账号全站 789 个库，
 * 其他 6 组共 363 个，789 − 363 = 426；该组后来被拆成 4 组，149+102+97+78 = 426
 * 再次对齐），该接口恒回 200 条。证据链：往该组建库，新库落在第 200 位、把原第 200
 * 位挤出窗口；从组里移走 1 个库，窗口立刻补进原第 201 个 —— 说明第 201 个库一直在
 * 组里、只是不返回，**这是滑动窗口而非容量上限**。
 * 因此**给调用方的建议是：每个分组不超过 200 个知识库**（建议值，不是硬限制）——超了就另开
 * 分组，否则该组总有一部分库在接口和网页端都看不见，人工核对和排序都会失真。
 *
 * 拿全量组内清单没有可用通道：GET /api/books?stack_id=<id> 的筛选参数实测被忽略
 * （照样返回全站 789 条，同批 id 完全一致），且 /api/books 的 stack_id 字段陈旧
 * （645/789 为 null），不能用来判归属；/api/mine/books 的 stack_id 同样被忽略，
 * 且翻页在 offset=400 处即重复返回。要精确清点只能用「排空法」：把窗口内的库搬到
 * 临时组，让原本隐藏的库补位，反复几轮，直到回查条数 < 200。
 */
export const STACK_BOOKS_WINDOW = 200;

/** 分组的最小可用形状（便于单测注入假数据） */
export type StackLike = { id: number; name: string; books: unknown[] };

/** 找出「返回窗口已满」的分组：这些分组里很可能还有看不到的知识库。 */
export function findWindowFullStacks<T extends StackLike>(stacks: T[]) {
  return stacks
    .filter((s) => s.books.length >= STACK_BOOKS_WINDOW)
    .map((s) => ({ id: s.id, name: s.name, books_returned: s.books.length }));
}

/** 给调用方的告警文案：窗口满 ≠ 组里只有 200 个。 */
export function buildWindowWarnings(
  full: Array<{ id: number; name: string; books_returned: number }>,
): string[] {
  return full.map(
    (s) =>
      `分组 ${s.id}「${s.name}」返回 ${s.books_returned} 个知识库，已达单次返回窗口 ${STACK_BOOKS_WINDOW}：` +
      `建议每个分组不超过 ${STACK_BOOKS_WINDOW} 个知识库——该组可能还有库没返回（窗口不是容量上限，库仍在组里、仍可用，只是接口不返回、网页端也不显示）；` +
      `超了就把该组拆成几个，否则组内清单没法完整看到。` +
      `注意 GET /api/books?stack_id 过滤无效且 stack_id 字段陈旧，拿不到全量组内清单。`,
  );
}

export const mineBookStacks: McpTool = {
  name: "yuque_get_book_stacks",
  description:
    "获取当前用户的知识库分组（书架）列表，含每个分组下的知识库。需要 cookie+ctoken 认证。" +
    "GET /api/mine/book_stacks。⚠️ 建议每个分组不超过 200 个知识库（建议值，不是接口硬限制）：" +
    "接口每组只返回 200 个（单次返回窗口），组内真实数量可能更多，超出部分不返回、网页端也只显示 200 个；" +
    "过滤/翻页参数一律无效，拿不到全量组内清单。超了就把分组拆开，库才都看得见",

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

    // 窗口满的分组必须显式告知调用方：否则「接口只回 200 个」会被误读成
    // 「该分组只有 200 个知识库」，进而误判分组容量、误判导入是否成功。
    const full = findWindowFullStacks(stacks);
    const warnings = buildWindowWarnings(full);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              stacks,
              ...(warnings.length > 0 ? { warnings, possibly_truncated: full } : {}),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
