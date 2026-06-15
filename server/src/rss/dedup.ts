/**
 * rss/dedup — 去重逻辑
 *
 * 职责：检查目标知识库已有文档，避免重复写入。
 * 策略：优先按原文链接（description 中的 URL）去重。
 *       如果 description 解析不到链接，fallback 到标题去重。
 */

import { apiGet, isErrorResult } from "../common/api-client.js";

/** 去重结果 */
export interface DedupResult {
  linkSet: Set<string>;     // 已存在的原文链接集合（主要去重依据）
  titleSet: Set<string>;    // 已存在的标题集合（兜底）
  total: number;
}

/**
 * 获取目标知识库已有文档的链接和标题，构建去重集合
 *
 * 核心去重链：description 中提取的原文链接。
 * 每篇 RSS 写入的文档 description 格式为 "原文链接: https://..."
 * 降级方案：如果链接提取不到，按标题去重。
 *
 * 上限：最多扫描 500 篇（5 页 x 100），超大规模知识库可能漏检。
 */
export async function buildDedupSet(bookId: string): Promise<DedupResult> {
  const titleSet = new Set<string>();
  const linkSet = new Set<string>();
  const maxPages = 5;
  const limit = 100;

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const data = await apiGet(
      `/repos/${bookId}/docs`,
      { offset: String(offset), limit: String(limit), optional_properties: "hits" },
      "Dedup: list docs",
    );

    if (isErrorResult(data)) break;

    const docs = (data as { data?: Array<{ title: string; description?: string }> })?.data ?? [];
    if (docs.length === 0) break;

    for (const doc of docs) {
      titleSet.add(doc.title);
      if (doc.description) {
        // description 格式: "原文链接: https://..."
        const m = doc.description.match(/https?:\/\/\S+/);
        if (m) linkSet.add(m[0]);
      }
    }

    if (docs.length < limit) break;
  }

  return { linkSet, titleSet, total: titleSet.size };
}

/**
 * 检查条目是否已存在
 *
 * 去重优先级：link > title > guid
 * - link: 匹配 description 中的原文链接（最可靠）
 * - title: 匹配文档标题（兜底，可能有同标题不同文章）
 */
export function isDuplicate(
  entry: { title: string; link: string },
  dedup: DedupResult,
): boolean {
  // 优先链接去重
  if (dedup.linkSet.has(entry.link)) return true;
  // 兜底标题去重
  if (dedup.titleSet.has(entry.title)) return true;
  return false;
}