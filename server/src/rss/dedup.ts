/**
 * rss/dedup — slug 生成逻辑
 *
 * slug 生成优先级：
 *   1. config.json 中 rss.sources.{source}.slug_pattern — 正则提取站点文章 ID
 *   2. fallback: md5(link).slice(0, 12)
 */

import { createHash } from "crypto";
import { getRssSources } from "./sources.js";

/** 生成去重 slug */
export function buildSlug(source: string, link: string): string {
  const sources = getRssSources();
  const src = sources[source];
  if (src?.slug_pattern) {
    try {
      const m = link.match(new RegExp(src.slug_pattern));
      if (m?.[1]) return `${source}-${m[1]}`;
    } catch { /* regex 无效则 fallback */ }
  }
  return createHash("md5").update(link).digest("hex").slice(0, 12);
}