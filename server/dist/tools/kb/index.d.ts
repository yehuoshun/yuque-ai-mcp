import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档（一对多）
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。一对多：一个关键词可指向多篇源文档。
 * 每个 entry 自带 文档标题/关键词/搜索面/摘要 元数据。
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
/**
 * 解析索引文档 body → entries。兼容新旧格式。
 */
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
