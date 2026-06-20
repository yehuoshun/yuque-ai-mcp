/**
 * rss/sources — RSS 源类型定义 + 加载器
 *
 * 源定义在 config.json 的 rss.sources 中，不硬编码在代码里。
 * 新增数据源只需改 config，无需改代码。
 */

import { loadRssSources, type RssFeedDef, type RssSourceDef } from "../common/config.js";

// 重新导出类型，保持向后兼容
export type { RssFeedDef, RssSourceDef };
export type RssFeed = RssFeedDef;
export type RssSource = RssSourceDef;

export interface ParamDef {
  type: "string" | "number";
  description: string;
  required?: boolean;
  default?: string | number;
}

/** 获取所有 RSS 源（从 config.json 读取） */
export function getRssSources(): Record<string, RssSourceDef> {
  return loadRssSources();
}