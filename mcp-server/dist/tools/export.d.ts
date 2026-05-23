/**
 * 批量获取多篇文档的 Markdown body
 * 底层走 get_doc API（export 端点已不存在于语雀 v2 API）
 */
export declare function batchGetDocsBody(params: {
    docs: Array<{
        book_id: number;
        doc_id: number;
    }>;
}): Promise<string>;
