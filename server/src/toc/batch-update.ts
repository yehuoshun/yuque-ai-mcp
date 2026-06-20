/**
 * toc/batch-update — 批量更新知识库目录
 *
 * Agent 出变更计划（ops），Tool 原样执行，零决策。
 * 纯 TOC 操作，跨库复制请用 yuque_copy_doc。
 * 端点：PUT /api/v2/repos/:book_id/toc
 *
 * TOC 缓存 + 目录创建复用 common/toc-cache.ts。
 */

import type { McpTool } from "../common/types.js";
import { apiPut, isErrorResult } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import {
  getTocCached,
  invalidateTocCache,
  ensureTitle,
  resolveTarget,
} from "../common/toc-cache.js";

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
  target_title?: string;
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
  new_node_uuid?: string;
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
): Promise<{ success: boolean; detail?: string; error?: string; new_node_uuid?: string }> {
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
      invalidateTocCache(opBookId);
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
      invalidateTocCache(opBookId);
      return { success: true, detail: `删除节点: ${op.node_uuid}` };
    }

    case "moveNode": {
      const opBookId = (op as any).book_id || bookId;
      if (!op.node_uuid) return { success: false, error: "moveNode 缺少 node_uuid 字段" };

      const targetUuid = await resolveTarget(opBookId, op as any);

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

      // 再 append 到目标位置
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

      invalidateTocCache(opBookId);
      return { success: true, detail: `移动节点: ${op.node_uuid}` };
    }

    default:
      return { success: false, error: `未知操作: ${(op as any).action}` };
  }
}