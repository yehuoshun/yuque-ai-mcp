/**
 * 知识库搜索 — 双层路由：总库关键词路由 → 子库关键词索引
 *
 * 1. tokens in:title 搜总库 → 找到关键词路由文档
 * 2. 路由文档 body 为 source_books 数组 [{book_id, namespace, last_built?}]
 * 3. tokens in:title 搜子库 → 找到关键词索引文档
 * 4. 读取索引文档 → parseIndexDoc 展开 → 返回源文档指针
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
}): Promise<string>;
