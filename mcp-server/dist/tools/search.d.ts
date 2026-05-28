/**
 * 搜索语雀内容
 *
 * 返回 Markdown 文本：分页信息 + 去重结果列表
 *
 * @param query 搜索关键词
 * @param scope 搜索范围 namespace（可选，默认全库）
 * @param type 搜索类型（默认 doc）
 * @param page 页码（默认 1）
 */
export declare function search(params: {
    query: string;
    scope?: string;
    type?: string;
    page?: number;
}): Promise<string>;
