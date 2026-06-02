import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 JSON 数组，每项为一个 DocEntry。
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
/**
 * 解析索引文档 body → entries
 *
 * body 格式：JSON 数组 [{doc_id, namespace, doc_title, slug, url, weight, ...}]
 */
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
