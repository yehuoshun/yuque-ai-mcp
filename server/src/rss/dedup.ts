/**
 * rss/dedup — 去重逻辑
 *
 * 职责：检查目标知识库已有文档，避免重复写入。
 * 去重依据：文档标题（语雀文档 title 字段）。
 */

import { apiGet, isErrorResult } from "../common/api-client.js";

/** 去重结果 */
export interface DedupResult {
  existing: Set<string>;   // 已存在的标题集合
  existingLinks: Set<string>; // 已存在的原文链接集合
  total: number;           // 知识库文档总数
}

/**
 * 获取目标知识库已有文档的标题和链接，用于去重
 *
 * 策略：分页获取全部文档标题，构建去重集合。
 * 如果知识库文档很多（>500），只取最近 500 篇做去重。
 */
export async function buildDedupSet(bookId: string): Promise<DedupResult> {
  const existing = new Set<string>();
  const existingLinks = new Set<string>();
  const maxPages = 5; // 最多取 5 页（500 篇）
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const data = await apiGet(
      `/repos/${bookId}/docs`,
      { offset: String(offset), limit: String(limit) },
      "Dedup: list docs",
    );

    if (isErrorResult(data)) break;

    const docs = (data as { data?: Array<{ title: string; description?: string }> })?.data ?? [];
    if (docs.length === 0) break;

    for (const doc of docs) {
      existing.add(doc.title);
      // description 中可能存了原文链接
      if (doc.description) {
        const linkMatch = doc.description.match(/https?:\/\/[^\s]+/);
        if (linkMatch) existingLinks.add(linkMatch[0]);
      }
    }

    if (docs.length < limit) break; // 最后一页
  }

  return { existing, existingLinks, total: existing.size };
}

/**
 * 检查条目是否已存在
 */
export function isDuplicate(
  entry: { title: string; link: string },
  dedup: DedupResult,
  dedupField: "link" | "title" | "guid",
): boolean {
  if (dedupField === "link") {
    return dedup.existingLinks.has(entry.link);
  }
  // title 去重：检查标题是否匹配
  return dedup.existing.has(entry.title);
}