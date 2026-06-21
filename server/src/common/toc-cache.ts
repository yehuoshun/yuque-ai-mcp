/**
 * common/toc-cache — TOC 缓存与目录操作公共逻辑
 *
 * 职责：TOC 缓存（24h TTL + 定时清理）、目录创建/查找。
 * copy-doc 和 batch-update-toc 共用。
 */

import { apiGet, apiPut, isErrorResult } from "./api-client.js";

// ─── TOC 缓存 ────────────────────────────────────────────

interface TocCacheEntry {
  nodes: Array<Record<string, unknown>>;
  expiresAt: number;
}

const tocCache = new Map<string, TocCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 天

// 每小时清理过期缓存
const CLEANUP_INTERVAL = 60 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tocCache) {
    if (entry.expiresAt <= now) tocCache.delete(key);
  }
}, CLEANUP_INTERVAL);
if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
  (cleanupTimer as NodeJS.Timeout).unref();
}

/** 获取知识库 TOC（优先缓存，24h TTL）。失败时 throw，不静默返回空数组 */
export async function getTocCached(bookId: string): Promise<Array<Record<string, unknown>>> {
  const cached = tocCache.get(bookId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.nodes;
  }

  const data = await apiGet(`/repos/${bookId}/toc`, undefined, "Get TOC (cached)");
  if (isErrorResult(data)) {
    throw new Error(`获取 TOC 失败: ${bookId}`);
  }

  const nodes = (data as { data?: Array<Record<string, unknown>> }).data || [];
  tocCache.set(bookId, { nodes, expiresAt: Date.now() + CACHE_TTL_MS });
  return nodes;
}

/** 使缓存失效（写操作后调用） */
export function invalidateTocCache(bookId: string): void {
  tocCache.delete(bookId);
}

// ─── 目录查找 ────────────────────────────────────────────

/** 在 TOC 中查找 TITLE 节点（按名称 + 可选父节点） */
export function findTitleNode(
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

// ─── 目录创建/复用 ────────────────────────────────────────

/**
 * 确保目录存在：有则复用 uuid，无则创建。
 * PUT 返回完整 TOC，直接从中提取 uuid 并更新缓存，不额外 GET。
 */
export async function ensureTitle(
  bookId: string,
  title: string,
  parentUuid?: string,
): Promise<{ uuid: string; created: boolean }> {
  const nodes = await getTocCached(bookId);
  const existing = findTitleNode(nodes, title, parentUuid);
  if (existing) {
    return { uuid: existing.uuid as string, created: false };
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
  tocCache.set(bookId, { nodes: tocNodes, expiresAt: Date.now() + CACHE_TTL_MS });

  const created = findTitleNode(tocNodes, title, parentUuid);
  if (!created?.uuid) throw new Error(`创建目录后找不到: ${title}`);

  return { uuid: created.uuid as string, created: true };
}

/**
 * 确保目录路径存在（多层级），返回最末端节点 uuid。
 * 用于 copy-doc 等需要 "Java/Spring/Boot" 路径的场景。
 */
export async function ensureDirectoryPath(
  bookId: string,
  path: string,
): Promise<string | null> {
  const parts = path.split("/").filter(Boolean);
  let parentUuid: string | undefined;

  for (const part of parts) {
    try {
      const { uuid } = await ensureTitle(bookId, part, parentUuid);
      parentUuid = uuid;
    } catch {
      return null;
    }
  }

  return parentUuid || null;
}

// ─── 文档追加到 TOC（公共） ──────────────────────────────

/**
 * 将文档追加到 TOC 指定节点下。
 * 供 create_doc / copy_doc / import_url / import_file 共用，
 * 避免 doc 域重复造轮子。
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

/** 销毁缓存定时器（进程退出时调用） */
export function destroyTocCache(): void {
  clearInterval(cleanupTimer);
  tocCache.clear();
}

/** 解析 target：支持 target_uuid 或 target_title */
export async function resolveTarget(
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