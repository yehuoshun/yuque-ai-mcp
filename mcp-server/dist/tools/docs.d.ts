/**
 * 列出知识库内的文档
 */
export declare function listDocs(params: {
    book_id: number;
    offset?: number;
    limit?: number;
}): Promise<string>;
/**
 * 获取文档详情
 * 默认返回 JSON 含完整字段，适配 markdown/lake/html/lakesheet 多种格式
 * raw=true 时返回纯文本（仅 markdown 格式文档可用）
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
    format?: "markdown" | "html" | "lake";
    slug?: string;
    public?: 0 | 1 | 2;
}): Promise<string>;
/**
 * 更新文档
 */
export declare function updateDoc(params: {
    book_id: number;
    doc_id: number;
    title?: string;
    body?: string;
    slug?: string;
    format?: "markdown" | "html" | "lake";
    public?: 0 | 1 | 2;
}): Promise<string>;
/**
 * 删除文档
 */
export declare function deleteDoc(params: {
    book_id: number;
    doc_id: number;
}): Promise<string>;
/**
 * 获取文档版本列表
 */
export declare function listDocVersions(params: {
    doc_id: number;
}): Promise<string>;
/**
 * 获取文档版本详情
 */
export declare function getDocVersion(params: {
    version_id: number;
}): Promise<string>;
/**
 * 列出知识库目录
 */
export declare function listToc(params: {
    book_id: number;
}): Promise<string>;
/**
 * 更新知识库目录
 * action: appendNode=尾插 prependNode=头插 editNode=编辑节点 removeNode=删除节点
 * action_mode: sibling=同级 child=子节点
 */
export declare function updateToc(params: {
    book_id: number;
    action?: "appendNode" | "prependNode" | "editNode" | "removeNode";
    action_mode?: "sibling" | "child";
    type?: "DOC" | "TITLE" | "LINK";
    doc_ids?: number[];
    target_uuid?: string;
    title?: string;
}): Promise<string>;
/**
 * 从目录中移除节点（不删除文档）
 */
export declare function removeTocNode(params: {
    book_id: number;
    target_uuid: string;
}): Promise<string>;
