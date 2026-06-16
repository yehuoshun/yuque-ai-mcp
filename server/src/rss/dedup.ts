/**
 * rss/dedup — slug 生成逻辑
 *
 * slug 生成优先级：
 *   1. sources.ts 中的 slugResolver(link)  — 提取站点文章 ID
 *   2. fallback: md5(link).slice(0, 12)
 */

import { createHash } from "crypto";
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