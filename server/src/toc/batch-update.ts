/**
 * toc/batch-update — 批量更新知识库目录
 *
 * Agent 出变更计划（ops），Tool 原样执行，零决策。
 * 纯 TOC 操作，跨库复制请用 yuque_copy_doc。
 * 端点：PUT /api/v2/repos/:book_id/toc
 *
 * 目录缓存：每个知识库的 TOC 缓存 1 天，避免重复 API 调用。
 * createTitle 自动检查目标目录是否已存在，存在则复用 uuid。
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPut, isErrorResult } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";

// ─── op 类型 ──────────────────────────────────────────────

interface CreateTitleOp {
  action: "createTitle";
  title: string;
  target_uuid?: string;
  book_id?: string;
}

interface AppendNodeOp {
  action: "appendNode";
  doc_ids: string;
  target_uuid?: string;
  target_title?: string;  // 按 TITLE 名称查找目标节点
  action_mode?: string;
  book_id?: string;
}

interface RemoveNodeOp {
  action: "removeNode";
  node_uuid: string;
  book_id?: string;
}

interface MoveNodeOp {
  action: "moveNode";
  node_uuid: string;
  target_uuid?: string;
  target_title?: string;
  action_mode?: string;
  book_id?: string;
}

type TocOp = CreateTitleOp | AppendNodeOp | RemoveNodeOp | MoveNodeOp;

// ─── 结果类型 ─────────────────────────────────────────────

interface OpResult {
  index: number;
  action: string;
  success: boolean;
  detail?: string;
  error?: string;
  new_doc_id?: number;
  new_node_uuid?: string;
}

// ─── TOC 缓存（1 天 TTL） ─────────────────────────────────

interface TocCacheEntry {
  nodes: Array<Record<string, unknown>>;
  expiresAt: number;
}

const tocCache = new Map<string, TocCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 天

/** 获取知识库 TOC（优先缓存） */
async function getTocCached(bookId: string): Promise<Array<Record<string, unknown>>> {
  const cached = tocCache.get(bookId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.nodes;
  }

  const data = await apiGet(`/repos/${bookId}/toc`, undefined, "Get TOC (cached)");
  if (isErrorResult(data)) {
    // 缓存失败不阻塞，返回空数组让调用方处理
    return [];
  }

  const nodes = (data as { data?: Array<Record<string, unknown>> }).data || [];
  tocCache.set(bookId, { nodes, expiresAt: Date.now() + CACHE_TTL_MS });
  return nodes;
}

/** 刷新缓存（写操作后调用） */
async function refreshCache(bookId: string): Promise<void> {
  tocCache.delete(bookId);
  await getTocCached(bookId);
}

/** 在 TOC 中查找 TITLE 节点（按名称 + 可选父节点） */
function findTitleNode(
  nodes: Array<Record<string, unknown>>,
  title: string,
  parentUuid?: string,
): Record<string, unknown> | undefined {
  return nodes.find((n) =>
    n.type === "TITLE" &&
    n.title === title &&
    (parentUuid ? n.parent_uuid === parentUuid : !n.parent_uuid)
  );
}

/** 确保目录存在：有则复用 uuid，无则创建 */
async function ensureTitle(
  bookId: string,
  title: string,
  parentUuid?: string,
): Promise<{ uuid: string; created: boolean }> {
  const nodes = await getTocCached(bookId);
  const existing = findTitleNode(nodes, title, parentUuid);
  if (existing) {
    return { uuid: existing.uuid as string, created: false };
  }

  // 不存在，创建
  const payload: Record<string, unknown> = {
    action: "appendNode",
    action_mode: "child",
    type: "TITLE",
    title,
  };
  if (parentUuid) payload.target_uuid = parentUuid;

  const data = await apiPut(`/repos/${bookId}/toc`, payload, `Create TITLE: ${title}`);
  if (isErrorResult(data)) {
    throw new Error(`创建目录失败: ${title}`);
  }

  // 从 API 响应中直接提取新节点的 uuid
  const tocNodes = (data as { data?: Array<Record<string, unknown>> }).data || [];
  const created = tocNodes.find((n: Record<string, unknown>) =>
    n.type === "TITLE" && n.title === title &&
    (parentUuid ? n.parent_uuid === parentUuid : !n.parent_uuid)
  );
  if (created?.uuid) {
    // 刷新缓存
    tocCache.delete(bookId);
    return { uuid: created.uuid as string, created: true };
  }

  // 兜底：刷新缓存后再查
  tocCache.delete(bookId);
  const freshNodes = await getTocCached(bookId);
  const fallback = findTitleNode(freshNodes, title, parentUuid);
  if (fallback) return { uuid: fallback.uuid as string, created: true };

  throw new Error(`创建目录后找不到: ${title}`);
}

/** 解析 target：支持 target_uuid 或 target_title */
async function resolveTarget(
  bookId: string,
  op: { target_uuid?: string; target_title?: string },
): Promise<string | undefined> {
  if (op.target_uuid) return op.target_uuid;
  if (op.target_title) {
    const nodes = await getTocCached(bookId);
    const node = findTitleNode(nodes, op.target_title);
    if (!node) throw new Error(`找不到 TITLE: ${op.target_title}`);
    return node.uuid as string;
  }
  return undefined;
}

// ─── 工具定义 ─────────────────────────────────────────────

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

// ─── 执行单个 op ─────────────────────────────────────────

async function executeOp(
  op: TocOp,
  bookId: string,
): Promise<{ success: boolean; detail?: string; error?: string; new_doc_id?: number; new_node_uuid?: string }> {
  switch (op.action) {
    case "createTitle": {
      const opBookId = (op as any).book_id || bookId;
      const title = op.title;
      if (!title) return { success: false, error: "createTitle 缺少 title 字段" };

      const { uuid, created } = await ensureTitle(opBookId, title, op.target_uuid);
      if (created) {
        return { success: true, detail: `创建目录: ${title}`, new_node_uuid: uuid };
      } else {
        return { success: true, detail: `复用已有目录: ${title}`, new_node_uuid: uuid };
      }
    }

    case "appendNode": {
      const opBookId = (op as any).book_id || bookId;
      let docIds: number[];
      try {
        docIds = JSON.parse(op.doc_ids);
        if (!Array.isArray(docIds) || docIds.length === 0) {
          return { success: false, error: "appendNode doc_ids 必须是非空 JSON 数组" };
        }
      } catch {
        return { success: false, error: "appendNode doc_ids 格式无效" };
      }

      const targetUuid = await resolveTarget(opBookId, op as any);

      const payload: Record<string, unknown> = {
        action: "appendNode",
        action_mode: op.action_mode || "child",
        type: "DOC",
        doc_ids: docIds,
      };
      if (targetUuid) payload.target_uuid = targetUuid;

      const data = await apiPut(`/repos/${opBookId}/toc`, payload, `Append docs to TOC`);
      if (isErrorResult(data)) {
        return { success: false, error: `挂载文档失败: ${docIds.join(",")}` };
      }
      // 写操作后刷新缓存
      await refreshCache(opBookId);
      return { success: true, detail: `挂载文档 ${docIds.join(",")} 到目录` };
    }

    case "removeNode": {
      const opBookId = (op as any).book_id || bookId;
      if (!op.node_uuid) return { success: false, error: "removeNode 缺少 node_uuid 字段" };

      const data = await apiPut(`/repos/${opBookId}/toc`, {
        action: "removeNode",
        action_mode: "sibling",
        node_uuid: op.node_uuid,
      }, `Remove TOC node: ${op.node_uuid}`);
      if (isErrorResult(data)) {
        return { success: false, error: `删除节点失败: ${op.node_uuid}` };
      }
      await refreshCache(opBookId);
      return { success: true, detail: `删除节点: ${op.node_uuid}` };
    }

    case "moveNode": {
      const opBookId = (op as any).book_id || bookId;
      if (!op.node_uuid) return { success: false, error: "moveNode 缺少 node_uuid 字段" };

      const targetUuid = await resolveTarget(opBookId, op as any);

      // 查原节点信息
      const nodes = await getTocCached(opBookId);
      const node = nodes.find((n: Record<string, unknown>) => n.uuid === op.node_uuid);
      if (!node) {
        return { success: false, error: `节点不存在: ${op.node_uuid}` };
      }

      const nodeType = node.type as string;
      const nodeTitle = node.title as string;
      const nodeDocId = node.doc_id as number;

      // 先删原节点
      const removeResult = await apiPut(`/repos/${opBookId}/toc`, {
        action: "removeNode",
        action_mode: "sibling",
        node_uuid: op.node_uuid,
      }, `Move node: remove ${op.node_uuid}`);
      if (isErrorResult(removeResult)) {
        return { success: false, error: `移动节点 remove 失败: ${op.node_uuid}` };
      }

      // 再在目标位置 append
      const appendPayload: Record<string, unknown> = {
        action: "appendNode",
        action_mode: op.action_mode || "child",
        type: nodeType,
      };
      if (nodeType === "DOC" && nodeDocId) {
        appendPayload.doc_ids = [nodeDocId];
      } else if (nodeType === "TITLE") {
        appendPayload.title = nodeTitle;
      } else if (nodeType === "LINK") {
        appendPayload.title = nodeTitle;
        appendPayload.url = node.url;
      }
      if (targetUuid) appendPayload.target_uuid = targetUuid;

      const appendResult = await apiPut(`/repos/${opBookId}/toc`, appendPayload, `Move node: append ${op.node_uuid}`);
      if (isErrorResult(appendResult)) {
        return { success: false, error: `移动节点 append 失败: ${op.node_uuid}（remove 已执行，文档可能游离在根目录）` };
      }

      await refreshCache(opBookId);
      return { success: true, detail: `移动节点: ${op.node_uuid}` };
    }

    default:
      return { success: false, error: `未知操作: ${(op as any).action}` };
  }
}