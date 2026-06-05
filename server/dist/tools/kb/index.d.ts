import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 Markdown 格式：每个源文档一个块（标题 + 搜索面 + 摘要 + 元数据）。
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
/**
 * 解析索引文档 Markdown body → ParsedIndexDoc
 *
 * body 格式（每个 entry 一个 # 块）：
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
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
