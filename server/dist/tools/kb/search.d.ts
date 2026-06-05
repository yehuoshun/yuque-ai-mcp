/**
 * 知识库搜索 — 索引库直搜 + 图谱扩展 + 降级
 *
 * 1. 搜所有索引库 → 找标题匹配的索引文档
 * 2. 读索引文档 body → 展开 entries
 * 3. 命中 < 3 篇 → 图谱扩展（1 跳邻居补搜）
 * 4. 索引库 0 命中 → 自动降级语雀全库搜索
 * 5. 返回结构化 JSON（KbSearchResult）
 */
export declare function kbSearch(params: {
    tokens: string[];
    max_entries?: number;
}): Promise<string>;
/** 逐页拉取知识库全部文档（语雀 API limit ≤ 100） */
export declare function listAllDocs(bookId: number | string): Promise<any[]>;
