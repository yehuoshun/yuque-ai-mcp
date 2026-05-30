/**
 * 知识库搜索 — 双层路由：总库关键词文档 → 子库索引文档
 *
 * 1. tokens in:title 搜总库 → 找到关键词路由文档
 * 2. 读取路由文档 body → 解析 index_books 拿到子库索引文档 {did, ns} 指针
 * 3. 直接 GET 子库索引文档 → parseIndexDoc 展开 → 返回源文档列表
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
}): Promise<string>;
