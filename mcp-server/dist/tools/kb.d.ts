interface IndexBlock {
    keywords: string;
    summary: string;
    doc_id: number;
    namespace: string;
    title?: string;
    slug?: string;
}
/**
 * 知识库搜索 — 管道全自动（双层：路由 + 子索引库）
 *
 * 输入：搜索 token 数组 + 索引总库信息
 * 输出：Markdown 文本（title/url/summary/keywords + 脏块标记）
 *
 * 流程：
 *   tokens → 搜总库 [路由] 文档 → 解析子索引库指针
 *   → 每个子索引库 fork 一条搜索管线（并行）
 *   → 合并所有结果 + did 去重 → Markdown
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
}): Promise<string>;
/**
 * 字符清洗：只去空格（语雀 search token 之间 AND 匹配，空格拆词）
 */
export declare function cleanSearchText(text: string): string;
interface CreateIndexDocParams {
    blocks: IndexBlock[];
    source_title: string;
    index_book_id: number | string;
}
/**
 * 创建单篇文档索引（新格式 v2 — 文档中心）
 *
 * 一篇源文档 → 一篇索引文档，多主题用 `---` 分块：
 *
 *   关键词：SpringBoot 自动配置 EnableAutoConfiguration...
 *   摘要：SpringBoot 通过 @EnableAutoConfiguration...
 *   id=584 | namespace=yehuoshun/dil9w3
 *   ---
 *   关键词：条件装配 ConditionalOnClass...
 *   摘要：SpringBoot 条件装配...
 *   id=584 | namespace=yehuoshun/dil9w3
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
export {};
