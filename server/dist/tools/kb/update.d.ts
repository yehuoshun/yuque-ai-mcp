import { DocEntry } from "./types.js";
/**
 * 增量更新关键词索引文档的 entries
 *
 * 自动完成读-改-写-路由同步的原子操作。
 * 支持 add（追加）、remove（移除）、update（按 doc_id 合并字段）。
 */
export declare function updateIndexEntries(params: {
    keyword: string;
    index_book_id: number | string;
    route_book_id?: number | string;
    add?: DocEntry[];
    remove?: number[];
    update?: DocEntry[];
}): Promise<string>;
