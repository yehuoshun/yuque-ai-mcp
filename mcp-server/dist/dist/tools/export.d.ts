/**
 * 导出单篇文档为 Markdown 内容
 */
export declare function exportDoc(params: {
    book_id: number;
    doc_id: number;
}): Promise<string>;
/**
 * 批量导出知识库的文档列表
 */
export declare function listDocsForExport(params: {
    book_id: number;
    offset?: number;
    limit?: number;
}): Promise<string>;
