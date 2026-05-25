interface SourceEntry {
    did: number;
    bid: number;
    ns: string;
    t: string;
    s?: string;
    wc?: number;
}
/**
 * 知识库搜索 — 管道全自动
 *
 * 输入：搜索 token 数组 + 子索引库信息
 * 输出：去重合并后的源文档指针列表
 *
 * 流程：
 *   tokens → N 路并行搜索子索引库 → 按 doc_id 去重
 *   → 并发读索引文档 body → 解析 entries JSON
 *   → 合并所有 entries → 按 did 去重 → 返回
 */
export declare function kbSearch(params: {
    tokens: string[];
    index_book_ns: string;
    index_book_id: number | string;
}): Promise<string>;
interface IndexCreateParams {
    keyword: string;
    search_surface: string;
    summary: string;
    entries: SourceEntry[];
    index_book_id: number | string;
}
/**
 * 创建单篇关键词索引文档
 *
 * 在子索引库中创建一篇 `[索引] {keyword}` 文档，
 * body 按标准三层格式组装：# 搜索面 + # 摘要 + entries JSON。
 */
export declare function createIndexDoc(params: IndexCreateParams): Promise<string>;
export {};
