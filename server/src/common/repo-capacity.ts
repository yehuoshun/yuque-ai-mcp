/**
 * common/repo-capacity — 仓库满了自动扩容
 *
 * 设计：book_id 是数组，最后一个为当前活跃仓库。
 * 创建文档时如果仓库满了，自动创建新仓库并追加到数组末尾。
 *
 * 语雀 API 在超过 5000 节点的知识库上不可用。
 */

import { loadConfig, saveConfig } from "./config.js";
import { apiPost, apiGet, isErrorResult } from "./api-client.js";
import { isBookFullError } from "./errors.js";

/** 语雀 API 可用节点上限（超过此数量 API 不可用） */
const REPO_DOC_LIMIT = 5000;

/**
 * 扩容：创建新仓库 → 追加 book_id → 保存 config → 返回新 book_id
 * @returns 新仓库 ID，失败返回 null
 */
async function expandRepo(
  domain: "rss" | "crawler",
  namespace: string,
): Promise<number | null> {
  const cfg = loadConfig();
  const ids = cfg[domain]?.namespaces?.[namespace]?.book_id ?? [];
  const n = ids.length + 1;
  const repoName = `${namespace}-${domain}-${n}`;

  // 创建新仓库
  const result = await apiPost(
    `/users/yehuoshun/repos`,
    { name: repoName, slug: repoName, public: 0 },
    `Auto-expand: ${repoName}`,
  );

  if (isErrorResult(result)) {
    console.error(`[expandRepo] 创建新仓库 "${repoName}" 失败:`, JSON.stringify(result));
    return null;
  }

  const newId = (result as { data?: { id: number } })?.data?.id;
  if (!newId) {
    console.error(`[expandRepo] 创建仓库成功但未获取到 ID`);
    return null;
  }

  // 追加到数组并保存
  if (!cfg[domain]) cfg[domain] = { enabled: true, namespaces: {} } as never;
  if (!cfg[domain]!.namespaces) cfg[domain]!.namespaces = {};
  if (!cfg[domain]!.namespaces![namespace]) {
    cfg[domain]!.namespaces![namespace] = { book_id: [] };
  }
  cfg[domain]!.namespaces![namespace].book_id.push(newId);
  saveConfig();

  return newId;
}

/**
 * 获取 namespace 的 items_count（文档数），用于判断是否需要扩容
 * 在创建文档前预判，避免先创建失败再扩容的性能损耗
 */
async function getRepoItemCount(bookId: number): Promise<number | null> {
  try {
    const data = await apiGet(`/repos/${bookId}`, undefined, "Check capacity");
    if (isErrorResult(data)) return null;
    return (data as { data?: { items_count?: number } })?.data?.items_count ?? null;
  } catch {
    return null;
  }
}

/**
 * 确保有可用仓库：如果当前仓库接近上限，自动扩容
 * 返回可用的 book_id（可能是扩容后的新 ID）
 */
export async function ensureRepoCapacity(
  domain: "rss" | "crawler",
  namespace: string,
  currentBookId: number,
): Promise<number | null> {
  // 检查当前仓库文档数
  const count = await getRepoItemCount(currentBookId);
  if (count !== null && count < REPO_DOC_LIMIT) {
    return currentBookId; // 还有空间
  }

  // 满了或无法检查 → 扩容
  return expandRepo(domain, namespace);
}

/**
 * 带自动扩容的文档创建
 * 
 * 先 try 创建，如果返回"仓库满了"错误 → 扩容 → 重试一次
 * 如果扩容成功但重试仍失败 → 返回失败
 */
export async function createDocWithAutoExpand(
  bookId: number,
  domain: "rss" | "crawler",
  namespace: string,
  payload: Record<string, unknown>,
  context: string,
): Promise<{ ok: boolean; id?: number; book_id?: number; expanded?: boolean; error?: string }> {
  // 第一次尝试
  const result = await apiPost(`/repos/${bookId}/docs`, payload, context);

  if (!isErrorResult(result)) {
    const docId = (result as { data?: { id: number } })?.data?.id;
    return { ok: true, id: docId, book_id: bookId };
  }

  // 检查是否是"满了"错误
  if (!isBookFullError(result)) {
    // 不是满的错误，直接返回失败
    return { ok: false, error: JSON.stringify(result) };
  }

  // 扩容
  const newBookId = await expandRepo(domain, namespace);
  if (!newBookId) {
    return { ok: false, error: "仓库已满且自动扩容失败" };
  }

  // 用新仓库重试
  const retryResult = await apiPost(`/repos/${newBookId}/docs`, payload, `Auto-expand retry: ${context}`);
  if (isErrorResult(retryResult)) {
    return { ok: false, expanded: true, error: `扩容成功 (${newBookId}) 但创建仍失败: ${JSON.stringify(retryResult)}` };
  }

  const docId = (retryResult as { data?: { id: number } })?.data?.id;
  return { ok: true, id: docId, book_id: newBookId, expanded: true };
}
