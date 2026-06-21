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
