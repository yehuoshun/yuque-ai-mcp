/**
 * 知识库搜索 — 双层路由 + 图谱扩展 + 降级
 *
 * 1. 搜索总库 → 找关键词路由文档 → 解析文档级 namespace
 * 2. 按 namespace 直接读索引文档 → 展开 entries
 * 3. 命中 < 3 篇 → 图谱扩展（1 跳邻居补搜）
 * 4. 路由 0 命中 → 自动降级语雀全库搜索
 * 5. 返回结构化 JSON（KbSearchResult）
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
    max_entries?: number;
}): Promise<string>;
/** 逐页拉取知识库全部文档（语雀 API limit ≤ 100） */
export declare function listAllDocs(bookId: number | string): Promise<any[]>;
