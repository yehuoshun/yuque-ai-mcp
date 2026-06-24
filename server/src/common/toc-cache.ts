/**
 * common/toc-cache — TOC 缓存层
 *
 * 职责：TOC 缓存（可配置 TTL + 定时清理），不含任何业务操作。
 * 目录创建/查找/文档追加等操作见 common/toc-ops.ts。
 *
 * TTL 通过 config.json 的 toc_cache_ttl_minutes 配置，默认 60 分钟。
 */

import { apiGet, isErrorResult } from "./api-client.js";
import { loadConfig } from "./config.js";

// ─── 缓存 ──────────────────────────────────────────────

interface TocCacheEntry {
  nodes: Array<Record<string, unknown>>;
  expiresAt: number;
}

const tocCache = new Map<string, TocCacheEntry>();
const DEFAULT_TTL_MINUTES = 60;

/** 读取配置的 TTL（分钟），默认 60 */
function getCacheTtlMs(): number {
  try {
    const cfg = loadConfig();
    const minutes = cfg.toc_cache_ttl_minutes ?? DEFAULT_TTL_MINUTES;
    return Math.max(1, minutes) * 60 * 1000; // 最少 1 分钟
  } catch {
    return DEFAULT_TTL_MINUTES * 60 * 1000;
  }
}

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

/** 获取知识库 TOC（优先缓存）。失败时 throw */
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
  tocCache.set(bookId, { nodes, expiresAt: Date.now() + getCacheTtlMs() });
  return nodes;
}

/** 用 API 返回的完整 TOC 更新缓存（写操作后调用，避免额外 GET） */
export function setTocCache(bookId: string, nodes: Array<Record<string, unknown>>): void {
  tocCache.set(bookId, { nodes, expiresAt: Date.now() + getCacheTtlMs() });
}

/** 使缓存失效（写操作后调用） */
export function invalidateTocCache(bookId: string): void {
  tocCache.delete(bookId);
}

/** 销毁缓存定时器（进程退出时调用） */
export function destroyTocCache(): void {
  clearInterval(cleanupTimer);
  tocCache.clear();
}
