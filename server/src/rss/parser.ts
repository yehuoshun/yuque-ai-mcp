/**
 * rss/parser — RSS/Atom XML 解析
 *
 * 职责：将 RSS 2.0 / Atom 1.0 格式的 XML 解析为统一的条目结构。
 * 不做网络请求，只做字符串 → 结构化的转换。
 */

import { unescapeHtml as decodeXmlEntities } from "../common/text-utils.js";

/** 统一条目结构，与 RSS/Atom 格式无关 */
export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  author: string;
  published: string; // ISO 8601
  guid: string;      // 唯一标识，fallback 到 link
}

/** 解析结果 */
export interface ParseResult {
  feedTitle: string;
  feedSubtitle: string;
  updated: string;
  entries: FeedEntry[];
  total: number;
}

/**
 * 解析 RSS 2.0 / Atom 1.0 格式的 XML 字符串
 */
export function parseFeed(xml: string): ParseResult {
  const feedTitle = extractTag(xml, "title") ?? extractAttr(xml, "feed", "title") ?? "Untitled Feed";
  const feedSubtitle = extractTag(xml, "subtitle") ?? extractTag(xml, "description") ?? "";
  const updated = extractTag(xml, "updated") ?? extractTag(xml, "lastBuildDate") ?? new Date().toISOString();

  // 支持 <item> (RSS) 和 <entry> (Atom)
  const entries: FeedEntry[] = [];
  const atomEntries = extractBlocks(xml, "entry");
  const rssItems = extractBlocks(xml, "item");

  const blocks = atomEntries.length > 0 ? atomEntries : rssItems;

  for (const block of blocks) {
    const title = extractTag(block, "title") ?? "";
    const link = extractLink(block);
    const summary = extractTag(block, "summary") ?? extractTag(block, "description") ?? "";
    const author = extractTag(block, "name") ?? extractTag(block, "author") ?? extractTag(block, "dc:creator") ?? "";
    const published = extractTag(block, "published") ?? extractTag(block, "pubDate") ?? extractTag(block, "dc:date") ?? "";
    const guid = extractTag(block, "guid") ?? extractTag(block, "id") ?? link;

    if (title && link) {
      entries.push({ title, link, summary, author, published, guid });
    }
  }

  return { feedTitle, feedSubtitle, updated, entries, total: entries.length };
}

// ── 内部工具函数 ──

/** 提取 <tag>内容</tag>，不支持嵌套同名标签 */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return decodeXmlEntities(m[1].trim());
}

/** 提取属性值，如 <feed title="xxx"> */
function extractAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, "i");
  const m = xml.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

/** 提取 <link> 的 href 或内容 */
function extractLink(block: string): string {
  const href = extractAttr(block, "link", "href");
  if (href) return href;
  return extractTag(block, "link") ?? "";
}

/** 提取所有 <tag>...</tag> 块（支持嵌套同标签） */
function extractBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const openRe = new RegExp(`<${tag}[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}>`, "gi");

  // 收集所有开始和结束位置
  interface Marker { pos: number; isOpen: boolean; raw: string; }
  const markers: Marker[] = [];

  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) !== null) {
    markers.push({ pos: m.index, isOpen: true, raw: m[0] });
  }
  while ((m = closeRe.exec(xml)) !== null) {
    markers.push({ pos: m.index, isOpen: false, raw: m[0] });
  }
  markers.sort((a, b) => a.pos - b.pos);

  let depth = 0;
  let start = 0;
  for (const mk of markers) {
    if (mk.isOpen) {
      if (depth === 0) start = mk.pos + mk.raw.length;
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        blocks.push(xml.slice(start, mk.pos));
      }
    }
  }

  return blocks;
}

// decodeXmlEntities 已从 common/text-utils.ts 导入