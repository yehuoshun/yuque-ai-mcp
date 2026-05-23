/**
 * 列出知识库内的文档
 */
export declare function listDocs(params: {
    book_id: number;
    offset?: number;
    limit?: number;
}): Promise<string>;
/**
 * 获取文档详情（Markdown）
 */
export declare function getDoc(params: {
    book_id: number;
    doc_id: number;
    raw?: boolean;
}): Promise<string>;
/**
 * 创建文档（自动挂 TOC）
 */
export declare function createDoc(params: {
    book_id: number;
    title: string;
    body: string;
    format?: "markdown" | "lake";
    slug?: string;
}): Promise<string>;
/**
 * 更新文档
 */
export declare function updateDoc(params: {
    book_id: number;
    doc_id: number;
    title?: string;
    body?: string;
}): Promise<string>;
/**
 * 删除文档
 */
export declare function deleteDoc(params: {
    book_id: number;
    doc_id: number;
}): Promise<string>;
