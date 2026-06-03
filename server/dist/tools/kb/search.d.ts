/**
 * 知识库搜索 — 双层路由：总库关键词路由 → 子库关键词索引
 *
 * 1. 全文搜索总库 + 客户端标题过滤 → 找到关键词路由文档
 * 2. 路由文档 body 为 JSON 数组 [{book_id, namespace}]，namespace 是文档级路径
 * 3. 按文档级 namespace 直接读索引文档（不再搜子库）
 * 4. parseIndexDoc 展开 → 返回源文档指针
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
}): Promise<string>;
/** 逐页拉取知识库全部文档（语雀 API limit ≤ 100） */
export declare function listAllDocs(bookId: number | string): Promise<any[]>;
