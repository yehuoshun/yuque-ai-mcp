/**
 * common/toc-ops — TOC 目录与文档操作层
 *
 * 职责：目录创建/查找、文档追加、路径解析。
 * 缓存层见 common/toc-cache.ts。
 *
 * 被 doc/copy-doc、doc/import-url、doc/import-file、doc/create-doc、
 * repo/copy-repo、toc/batch-update 共用。
 */

import { apiPut, isErrorResult } from "./api-client.js";
import { getTocCached, setTocCache, invalidateTocCache } from "./toc-cache.js";

// ─── 并发锁（防 ensureTitle 竞态） ─────────────────────

const inflight = new Map<string, Promise<{ uuid: string; created: boolean }>>();

function lockKey(bookId: string, title: string, parentUuid?: string): string {
  return `${bookId}::${title}::${parentUuid ?? "__root__"}`;
}

// ─── 目录查找 ──────────────────────────────────────────

/**
 * 在 TOC 中查找 TITLE 节点（按名称 + 可选父节点）。
 * parentUuid 不传时匹配根节点（parent_uuid 为 null 或 undefined 或空字符串）。
 */
export function findTitleNode(
  nodes: Array<Record<string, unknown>>,
  title: string,
  parentUuid?: string,
): Record<string, unknown> | undefined {
  return nodes.find((n) => {
    if (n.type !== "TITLE" || n.title !== title) return false;
    if (parentUuid !== undefined) {
      return n.parent_uuid === parentUuid;
    }
    // 根节点：parent_uuid 可能为 null / undefined / "" / 不存在
    return !n.parent_uuid || n.parent_uuid === "";
  });
}

// ─── 目录创建/复用 ─────────────────────────────────────

/**
 * 确保目录存在：有则复用 uuid，无则创建。
 * 带并发锁，防止两个请求同时创建同名目录。
 */
export async function ensureTitle(
  bookId: string,
  title: string,
  parentUuid?: string,
): Promise<{ uuid: string; created: boolean }> {
  const key = lockKey(bookId, title, parentUuid);

  // 已有进行中的请求 → 等它完成
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const nodes = await getTocCached(bookId);
    const found = findTitleNode(nodes, title, parentUuid);
    if (found) {
      return { uuid: found.uuid as string, created: false };
    }

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

    const tocNodes = (data as { data?: Array<Record<string, unknown>> }).data || [];
    setTocCache(bookId, tocNodes);

    const created = findTitleNode(tocNodes, title, parentUuid);
    if (!created?.uuid) throw new Error(`创建目录后找不到: ${title}`);

    return { uuid: created.uuid as string, created: true };
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

// ─── 路径创建 ──────────────────────────────────────────

export interface PathResult {
  /** 最末端节点 uuid，成功时有值 */
  uuid: string | null;
  /** 已创建成功的层级数 */
  created: number;
  /** 失败层级（1-based），0 表示全部成功 */
  failedAt: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 确保目录路径存在（多层级），返回结构化结果。
 * 失败时返回已创建层级数 + 失败位置，不静默吞错误。
 */
export async function ensureDirectoryPath(
  bookId: string,
  path: string,
): Promise<PathResult> {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { uuid: null, created: 0, failedAt: 0, error: "路径为空" };
  }

  let parentUuid: string | undefined;
  let created = 0;

  for (let i = 0; i < parts.length; i++) {
    try {
      const { uuid } = await ensureTitle(bookId, parts[i], parentUuid);
      parentUuid = uuid;
      created++;
    } catch (err) {
      return {
        uuid: null,
        created,
        failedAt: i + 1,
        error: `创建目录 "${parts[i]}" 失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { uuid: parentUuid || null, created, failedAt: 0 };
}

// ─── 文档追加到 TOC ────────────────────────────────────

/**
 * 将文档追加到 TOC 指定节点下。
 * 供 create_doc / copy_doc / import_url / import_file 共用。
 */
export async function appendDocToToc(
  bookId: string,
  docId: number,
  parentUuid?: string,
): Promise<{ ok: boolean; warning?: string }> {
  try {
    const payload: Record<string, unknown> = {
      action: "appendNode",
      action_mode: "child",
      type: "DOC",
      doc_ids: [docId],
    };
    if (parentUuid) payload.target_uuid = parentUuid;
    const res = await apiPut(`/repos/${bookId}/toc`, payload, "Append doc to TOC");
    if (isErrorResult(res)) {
      return { ok: false, warning: "文档创建成功，但追加到目录失败。请手动在语雀网页端调整目录。" };
    }
    invalidateTocCache(bookId);
    return { ok: true };
  } catch {
    return { ok: false, warning: "文档创建成功，但追加到目录时网络异常，请手动在语雀网页端调整目录。" };
  }
}

// ─── 目标解析 ──────────────────────────────────────────

/**
 * 解析 target：支持 target_uuid 或 target_title（+ 可选 parent_uuid）。
 * 修复：支持指定 parent_uuid 查找嵌套同名 TITLE。
 */
export async function resolveTarget(
  bookId: string,
  op: { target_uuid?: string; target_title?: string; target_parent_uuid?: string },
): Promise<string | undefined> {
  if (op.target_uuid) return op.target_uuid;
  if (op.target_title) {
    const nodes = await getTocCached(bookId);
    const node = findTitleNode(nodes, op.target_title, op.target_parent_uuid);
    if (!node) {
      const hint = op.target_parent_uuid
        ? `找不到 TITLE: ${op.target_title} (parent_uuid: ${op.target_parent_uuid})`
        : `找不到 TITLE: ${op.target_title}`;
      throw new Error(hint);
    }
    return node.uuid as string;
  }
  return undefined;
}

// ─── 批量 op 类型 ─────────────────────────────────────

export interface CreateTitleOp {
  action: "createTitle";
  title: string;
  target_uuid?: string;
  book_id?: string;
}

export interface AppendNodeOp {
  action: "appendNode";
  doc_ids: string;
  target_uuid?: string;
  target_title?: string;
  action_mode?: string;
  book_id?: string;
}

export interface RemoveNodeOp {
  action: "removeNode";
  node_uuid: string;
  book_id?: string;
}

export interface MoveNodeOp {
  action: "moveNode";
  node_uuid: string;
  doc_id?: number;
  target_uuid?: string;
  target_title?: string;
  action_mode?: string;
  book_id?: string;
}

export interface PrependDocOp {
  action: "prependDoc";
  doc_ids: string;
  target_uuid?: string;
  target_title?: string;
  book_id?: string;
}

export type TocOp = CreateTitleOp | AppendNodeOp | RemoveNodeOp | MoveNodeOp | PrependDocOp;

export interface OpResult {
  index: number;
  action: string;
  success: boolean;
  detail?: string;
  error?: string;
  new_node_uuid?: string;
}

// ─── 批量 op 执行 ─────────────────────────────────────

/**
 * 执行单个 TOC 操作（createTitle/appendNode/removeNode/moveNode）。
 * 从 batch-update.ts 抽离，供批量 TOC 操作共用。
 */
export async function executeOp(
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

      // 有目标目录时：先挂根再移（语雀 API 的 target_uuid 对 DOC 类型不可靠）
      if (targetUuid) {
        // Step 1: 挂到根目录
        const rootResult = await apiPut(`/repos/${opBookId}/toc`, {
          action: "appendNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: docIds,
        }, `Append docs to root`);
        if (isErrorResult(rootResult)) {
          return { success: false, error: `挂载文档到根目录失败: ${docIds.join(",")}` };
        }

        // Step 2: 从 PUT 响应提取新节点 uuid，逐个 remove + append 到目标
        const rootToc = (rootResult as { data?: Array<Record<string, unknown>> }).data || [];
        invalidateTocCache(opBookId);

        const moved: number[] = [];
        for (const docId of docIds) {
          const newNode = rootToc.find((n: Record<string, unknown>) => n.doc_id === docId && !n.parent_uuid);
          if (!newNode?.uuid) continue;
          await apiPut(`/repos/${opBookId}/toc`, {
            action: "removeNode",
            action_mode: "sibling",
            node_uuid: newNode.uuid,
          }, `Move: remove ${newNode.uuid}`);
          await apiPut(`/repos/${opBookId}/toc`, {
            action: "appendNode",
            action_mode: "child",
            type: "DOC",
            doc_ids: [docId],
            target_uuid: targetUuid,
          }, `Move: append ${docId}`);
          moved.push(docId);
        }

        invalidateTocCache(opBookId);
        return { success: true, detail: `挂载文档 ${moved.join(",")} 到目录（先挂根再移）` };
      }

      // 无目标目录：直接挂到根目录
      const payload: Record<string, unknown> = {
        action: "appendNode",
        action_mode: op.action_mode || "child",
        type: "DOC",
        doc_ids: docIds,
      };

      const data = await apiPut(`/repos/${opBookId}/toc`, payload, `Append docs to TOC`);
      if (isErrorResult(data)) {
        return { success: false, error: `挂载文档失败: ${docIds.join(",")}` };
      }

      invalidateTocCache(opBookId);
      return { success: true, detail: `挂载文档 ${docIds.join(",")} 到根目录` };
    }

    case "prependDoc": {
      const opBookId = (op as any).book_id || bookId;
      let docIds: number[];
      try {
        docIds = JSON.parse(op.doc_ids);
        if (!Array.isArray(docIds) || docIds.length === 0) {
          return { success: false, error: "prependDoc doc_ids 必须是非空 JSON 数组" };
        }
      } catch {
        return { success: false, error: "prependDoc doc_ids 格式无效" };
      }

      const targetUuid = await resolveTarget(opBookId, op as any);
      if (!targetUuid) {
        return { success: false, error: "prependDoc 需要 target_uuid 或 target_title（不能首插到根目录）" };
      }

      // Step 1: appendNode 到根目录 → 拿到新节点 uuid
      const rootResult = await apiPut(`/repos/${opBookId}/toc`, {
        action: "appendNode",
        action_mode: "child",
        type: "DOC",
        doc_ids: docIds,
      }, `Prepend: append to root`);
      if (isErrorResult(rootResult)) {
        return { success: false, error: `prependDoc 挂根失败: ${docIds.join(",")}` };
      }

      const rootToc = (rootResult as { data?: Array<Record<string, unknown>> }).data || [];
      invalidateTocCache(opBookId);

      // Step 2: 逐个 remove + prependNode 到目标最前面
      const moved: number[] = [];
      for (const docId of docIds) {
        const newNode = rootToc.find((n: Record<string, unknown>) => n.doc_id === docId && !n.parent_uuid);
        if (!newNode?.uuid) continue;
        await apiPut(`/repos/${opBookId}/toc`, {
          action: "removeNode",
          action_mode: "sibling",
          node_uuid: newNode.uuid,
        }, `Prepend: remove ${newNode.uuid}`);
        await apiPut(`/repos/${opBookId}/toc`, {
          action: "prependNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: [docId],
          target_uuid: targetUuid,
        }, `Prepend: prepend ${docId}`);
        moved.push(docId);
      }

      invalidateTocCache(opBookId);
      return { success: true, detail: `首插文档 ${moved.join(",")} 到目录（先挂根再 prepend）` };
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

      let nodeUuid = op.node_uuid;
      let nodeType: string;
      let nodeTitle: string;
      let nodeDocId: number | undefined;

      const nodes = await getTocCached(opBookId);
      const node = nodes.find((n: Record<string, unknown>) => n.uuid === op.node_uuid);

      if (!node) {
        // 节点不在 TOC 中：需要 doc_id 来先挂根再移
        const docId = (op as MoveNodeOp).doc_id;
        if (!docId) {
          return { success: false, error: `节点不在 TOC 中: ${op.node_uuid}。请提供 doc_id 字段，工具会自动挂根再移` };
        }

        // 先挂到根目录
        const rootResult = await apiPut(`/repos/${opBookId}/toc`, {
          action: "appendNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: [docId],
        }, `Move orphan: append to root ${docId}`);
        if (isErrorResult(rootResult)) {
          return { success: false, error: `游离文档挂根失败: ${docId}` };
        }

        // 从 PUT 响应提取新节点 uuid
        const rootToc = (rootResult as { data?: Array<Record<string, unknown>> }).data || [];
        invalidateTocCache(opBookId);
        const newNode = rootToc.find((n: Record<string, unknown>) => n.doc_id === docId && !n.parent_uuid);
        if (!newNode?.uuid) {
          return { success: false, error: `挂根后找不到文档: ${docId}` };
        }

        nodeUuid = newNode.uuid as string;
        nodeType = "DOC";
        nodeTitle = newNode.title as string;
        nodeDocId = docId;
      } else {
        nodeType = node.type as string;
        nodeTitle = node.title as string;
        nodeDocId = node.doc_id as number;
      }

      // 先删原节点
      const removeResult = await apiPut(`/repos/${opBookId}/toc`, {
        action: "removeNode",
        action_mode: "sibling",
        node_uuid: nodeUuid,
      }, `Move node: remove ${nodeUuid}`);
      if (isErrorResult(removeResult)) {
        return { success: false, error: `移动节点 remove 失败: ${nodeUuid}` };
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
        appendPayload.url = (node as any)?.url;
      }
      if (targetUuid) appendPayload.target_uuid = targetUuid;

      const appendResult = await apiPut(`/repos/${opBookId}/toc`, appendPayload, `Move node: append ${nodeUuid}`);
      if (isErrorResult(appendResult)) {
        return { success: false, error: `移动节点 append 失败: ${nodeUuid}（remove 已执行，文档可能游离在根目录）` };
      }

      invalidateTocCache(opBookId);
      const detail = !node
        ? `移动游离节点: doc_id=${nodeDocId} → 目标目录`
        : `移动节点: ${nodeUuid}`;
      return { success: true, detail };
    }

    default:
      return { success: false, error: `未知操作: ${(op as any).action}` };
  }
}
