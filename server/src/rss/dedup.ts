/**
 * rss/dedup — 去重逻辑（语雀 KV 方案）
 *
 * 策略：以文章链接提取 slug，通过 GET /repos/{book_id}/docs/{slug} 判断是否存在。
 * O(1) 单次 API 调用，无文档数量上限。
 *
 * slug 生成优先级：
 *   1. sources.ts 中的 slugResolver(link)  — 提取站点文章 ID
 *   2. fallback: md5(link).slice(0, 12)
 */

import { createHash } from "crypto";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { RSS_SOURCES } from "./sources.js";

/** 生成去重 slug */
export function buildSlug(source: string, link: string): string {
  const src = RSS_SOURCES[source];
  if (src?.slugResolver) {
    const resolved = src.slugResolver(link);
    if (resolved) return resolved;
  }
  // fallback: md5 前 12 位
  return createHash("md5").update(link).digest("hex").slice(0, 12);
}

/** 去重检查结果 */
export interface SlugCheckResult {
  slug: string;
  exists: boolean;
}

/**
 * 检查单个条目是否已存在
 * GET /repos/{book_id}/docs/{slug} → 200=重复, 404=新
 */
export async function checkSlug(bookId: string, slug: string): Promise<boolean> {
  const data = await apiGet(`/repos/${bookId}/docs/${slug}`, undefined, `Dedup check: ${slug}`);
  if (isErrorResult(data)) {
    // 404 或其他错误 → 视为不存在
    return false;
  }
  return true;
}

/**
 * 批量检查条目去重
 * 逐条查语雀 API（无批量端点，但每个 O(1)）
 */
export async function checkDuplicates(
  kvRepo: string,
  source: string,
  entries: Array<{ title: string; link: string }>,
): Promise<{ newEntries: Array<{ title: string; link: string; slug: string }>; skippedCount: number }> {
  const newEntries: Array<{ title: string; link: string; slug: string }> = [];
  let skippedCount = 0;

  for (const entry of entries) {
    const slug = buildSlug(source, entry.link);
    const exists = await checkSlug(kvRepo, slug);
    if (exists) {
      skippedCount++;
    } else {
      newEntries.push({ title: entry.title, link: entry.link, slug });
    }
  }

  return { newEntries, skippedCount };
}