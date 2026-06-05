import { DocEntry } from "./types.js";
/** 搜索 token / 关键词清洗：去空格去符号 */
export declare function cleanToken(token: string): string;
/**
 * 将 DocEntry[] 序列化为 Markdown body
 *
 * 格式（每个 entry 一块）：
 *   # {doc_title}
 *
 *   ## 关键词
 *   {keyword}
 *
 *   ## 搜索面
 *   {search_surface}
 *
 *   ## 摘要
 *   {summary}
 *
 *   ## 章节树
 *   - {id}: {title} — {summary}
 *
 *   ## doc_id
 *   {doc_id}
 *   ## 链接
 *   {url}
 *   ## 权重
 *   {weight}
 */
export declare function entriesToMarkdown(entries: DocEntry[]): string;
