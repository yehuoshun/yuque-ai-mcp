import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 JSON 数组，每项为一个 DocEntry。
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
export declare const titleCache: Map<string, {
    id: number;
    slug: string;
}>;
/** 按标题查找总库/子库中已存在的文档（用于幂等），带缓存 */
export declare function findDocByTitle(bookId: number | string, title: string): Promise<{
    id: number;
    slug: string;
} | null>;
/**
 * 总库路由文档 upsert：body 为 JSON 数组 [{book_id, namespace}]，
 * namespace 是文档级路径（group/slug/slug），指向子库中的具体索引文档。
 * 按 book_id 去重合并，不覆盖已有其他子库的指针。
 */
export declare function upsertRouteDoc(routeBookId: number | string, keyword: string, subBookId: number, docNs: string): Promise<void>;
/**
 * 解析索引文档 body → entries
 *
 * body 格式：JSON 数组 [{doc_id, namespace, doc_title, slug, url, weight, ...}]
 */
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
