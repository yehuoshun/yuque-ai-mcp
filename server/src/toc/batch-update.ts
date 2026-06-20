/**
 * toc/batch-update — 批量更新知识库目录
 *
 * Agent 出变更计划（ops），Tool 原样执行，零决策。
 * 支持本库整理和跨库整理。
 * 端点：PUT /api/v2/repos/:book_id/toc + POST /api/v2/repos/:book_id/docs
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { check, requiredString, oneOf } from "../common/validate.js";

// ─── op 类型 ──────────────────────────────────────────────

interface CreateTitleOp {
  action: "createTitle";
  title: string;
  target_uuid?: string;
}

interface AppendNodeOp {
  action: "appendNode";
  doc_ids: string;       // JSON 数组字符串
  target_uuid?: string;
  action_mode?: string;  // child | sibling，默认 child
  book_id?: string;      // 跨库时指定目标库
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
  action_mode?: string;
  book_id?: string;
}

interface CopyDocOp {
  action: "copyDoc";
  doc_id: number;
  source_book_id?: string;
  target_book_id?: string;
}

type TocOp = CreateTitleOp | AppendNodeOp | RemoveNodeOp | MoveNodeOp | CopyDocOp;

// ─── 结果类型 ─────────────────────────────────────────────

interface OpResult {
  index: number;
  action: string;
  success: boolean;
  detail?: string;
  error?: string;
}

// ─── 工具定义 ─────────────────────────────────────────────

export const tocBatchUpdate: McpTool = {
  name: "yuque_batch_update_toc",
  description: "Batch update repo TOC. Agent provides ops plan, tool executes only. Supports in-book and cross-book restructuring. ⚠️ Remove/move ops require confirm='RESTRUCTURE'. 详见 references/api/toc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Source repository ID or namespace (required)",
      },
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace. If set, cross-book mode: copyDoc ops copy to target, appendNode ops need book_id field. If omitted, in-book mode.",
      },
      ops: {
        type: "string",
        description: "JSON array of operations. Supported: createTitle, appendNode, removeNode, moveNode, copyDoc. See references/api/toc_api.md for format.",
      },
      mode: {
        type: "string",
        description: "Copy mode: 'copy' (default, keep source) or 'move' (delete source after copy). Only affects cross-book copyDoc ops.",
      },
      confirm: {
        type: "string",
        description: "Must be 'RESTRUCTURE' to proceed with any operation that modifies TOC.",
      },
    },
    required: ["book_id", "ops", "confirm"],
  },

  async handler(args) {
    // ─── 校验 ───────────────────────────────────────
    const v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.ops, "ops"),
      requiredString(args?.confirm, "confirm"),
      oneOf(args?.mode, "mode", ["copy", "move"]),
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
    const targetBookId = (args?.target_book_id as string) || bookId;
    const mode = (args?.mode as string) || "copy";

    // ─── 解析 ops ───────────────────────────────────
    let ops: TocOp[];
    try {
      ops = JSON.parse(args?.ops as string) as TocOp[];
      if (!Array.isArray(ops) || ops.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "INVALID_OPS",
            message: "ops 必须是非空 JSON 数组",
          }, null, 2) }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "INVALID_OPS",
          message: "ops 必须是有效的 JSON 数组",
        }, null, 2) }],
        isError: true,
      };
    }

    // ─── 逐条执行 ───────────────────────────────────
    const results: OpResult[] = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      try {
        const result = await executeOp(op, bookId, targetBookId, mode);
        results.push({ index: i, action: op.action, ...result });
      } catch (err) {
        results.push({
          index: i,
          action: op.action,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ─── 汇总 ───────────────────────────────────────
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        book_id: bookId,
        target_book_id: targetBookId !== bookId ? targetBookId : undefined,
        mode,
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
  targetBookId: string,
  mode: string,
): Promise<{ success: boolean; detail?: string; error?: string; new_doc_id?: number }> {
  switch (op.action) {
    case "createTitle": {
      const opBookId = (op as any).book_id || targetBookId;
      const title = op.title;
      if (!title) return { success: false, error: "createTitle 缺少 title 字段" };

      const payload: Record<string, unknown> = {
        action: "appendNode",
        action_mode: "child",
        type: "TITLE",
        title,
      };
      if (op.target_uuid) payload.target_uuid = op.target_uuid;

      const data = await apiPut(`/repos/${opBookId}/toc`, payload, `Create TITLE: ${title}`);
      if (isErrorResult(data)) {
        return { success: false, error: `创建目录失败: ${title}` };
      }
      return { success: true, detail: `创建目录: ${title}` };
    }

    case "appendNode": {
      const opBookId = (op as any).book_id || targetBookId;
      let docIds: number[];
      try {
        docIds = JSON.parse(op.doc_ids);
        if (!Array.isArray(docIds) || docIds.length === 0) {
          return { success: false, error: "appendNode doc_ids 必须是非空 JSON 数组" };
        }
      } catch {
        return { success: false, error: "appendNode doc_ids 格式无效" };
      }

      const payload: Record<string, unknown> = {
        action: "appendNode",
        action_mode: op.action_mode || "child",
        type: "DOC",
        doc_ids: docIds,
      };
      if (op.target_uuid) payload.target_uuid = op.target_uuid;

      const data = await apiPut(`/repos/${opBookId}/toc`, payload, `Append docs to TOC`);
      if (isErrorResult(data)) {
        return { success: false, error: `挂载文档失败: ${docIds.join(",")}` };
      }
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
      return { success: true, detail: `删除节点: ${op.node_uuid}` };
    }

    case "moveNode": {
      const opBookId = (op as any).book_id || bookId;
      if (!op.node_uuid) return { success: false, error: "moveNode 缺少 node_uuid 字段" };

      // 移动 = 先查原节点信息 → 在不同 parent 下 append → 删原节点
      // 简化：直接调语雀 TOC API，用 editNode 改 parent
      // 语雀 API 不支持直接改 parent，需要 remove + append 重建
      // 这里我们用 removeNode + appendNode 组合
      const tocData = await apiGet(`/repos/${opBookId}/toc`, undefined, "Get TOC for move");
      if (isErrorResult(tocData)) {
        return { success: false, error: `获取 TOC 失败: ${op.node_uuid}` };
      }

      const nodes = (tocData as { data?: Array<Record<string, unknown>> }).data || [];
      const node = nodes.find((n: Record<string, unknown>) => n.uuid === op.node_uuid);
      if (!node) {
        return { success: false, error: `节点不存在: ${op.node_uuid}` };
      }

      const nodeType = node.type as string;
      const nodeTitle = node.title as string;
      const nodeDocId = node.doc_id as number;

      // 先在目标位置 append
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
      if (op.target_uuid) appendPayload.target_uuid = op.target_uuid;

      const appendResult = await apiPut(`/repos/${opBookId}/toc`, appendPayload, `Move node: append ${op.node_uuid}`);
      if (isErrorResult(appendResult)) {
        return { success: false, error: `移动节点 append 失败: ${op.node_uuid}` };
      }

      // 再删原节点
      const removeResult = await apiPut(`/repos/${opBookId}/toc`, {
        action: "removeNode",
        action_mode: "sibling",
        node_uuid: op.node_uuid,
      }, `Move node: remove ${op.node_uuid}`);
      if (isErrorResult(removeResult)) {
        return { success: false, error: `移动节点 remove 失败: ${op.node_uuid}（append 已成功）` };
      }

      return { success: true, detail: `移动节点: ${op.node_uuid}` };
    }

    case "copyDoc": {
      if (targetBookId === bookId) {
        return { success: false, error: "copyDoc 需要 target_book_id 参数（跨库复制）" };
      }
      if (!op.doc_id) return { success: false, error: "copyDoc 缺少 doc_id 字段" };

      const srcBookId = op.source_book_id || bookId;
      const tgtBookId = op.target_book_id || targetBookId;

      // 拉取源文档
      const srcDoc = await apiGet(`/repos/${srcBookId}/docs/${op.doc_id}`, { raw: "1" }, `Fetch doc ${op.doc_id}`);
      if (isErrorResult(srcDoc)) {
        return { success: false, error: `拉取文档 ${op.doc_id} 失败` };
      }

      const docData = (srcDoc as { data?: { title: string; body: string; slug: string; book?: { namespace: string } } }).data;
      if (!docData) {
        return { success: false, error: `文档 ${op.doc_id} 内容为空` };
      }

      // 创建副本
      const createPayload: Record<string, unknown> = {
        title: docData.title,
        body: docData.body,
        format: "markdown",
      };
      const createResult = await apiPost(`/repos/${tgtBookId}/docs`, createPayload, `Create copy of doc ${op.doc_id}`);
      if (isErrorResult(createResult)) {
        return { success: false, error: `创建文档副本失败: ${op.doc_id}` };
      }

      const newDoc = (createResult as { data?: { id: number; slug: string } }).data;
      if (!newDoc?.id) {
        return { success: false, error: `创建文档 ${op.doc_id} 返回无 ID` };
      }

      // move 模式：删除源文档
      if (mode === "move") {
        await apiPut(`/repos/${srcBookId}/toc`, {
          action: "removeNode",
          action_mode: "sibling",
          node_uuid: `doc-${op.doc_id}`,
        }, `Remove source doc ${op.doc_id} after move`);
      }

      return { success: true, detail: `复制文档 ${op.doc_id} → ${tgtBookId}/${newDoc.id}`, new_doc_id: newDoc.id };
    }

    default:
      return { success: false, error: `未知操作: ${(op as any).action}` };
  }
}