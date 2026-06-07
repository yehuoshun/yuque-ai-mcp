/**
 * 列出知识库内的文档（返回结构化 JSON，不含 body 以节省 token）
 */
export declare function listDocs(params: {
    book_id: number | string;
    offset?: number;
    limit?: number;
    optional_properties?: string;
}): Promise<string>;
/**
 * 获取文档详情
 */
export declare function getDoc(params: {
    book_id: number | string;
    doc_id: number;
}): Promise<string>;
/**
 * 创建文档（自动挂 TOC，支持指定挂载位置）
 *
 * @param target_uuid - TOC 父节点 UUID，空字符串 = 根级（默认），指定即挂到对应节点下
 * @param action_mode - 挂载模式，默认 "child"（子节点），可选 "sibling"（同级）
 */
export declare function createDoc(params: {
    book_id: number | string;
    title: string;
    body: string;
    format?: "markdown" | "html" | "lake";
    slug?: string;
    public?: 0 | 1 | 2;
    target_uuid?: string;
    action_mode?: "sibling" | "child";
}): Promise<string>;
/**
 * 更新文档
 */
export declare function updateDoc(params: {
    book_id: number | string;
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
    book_id: number | string;
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
    book_id: number | string;
}): Promise<string>;
/**
 * 更新知识库目录
 * action: appendNode=尾插 prependNode=头插 editNode=编辑节点 removeNode=删除节点
 * action_mode: sibling=同级 child=子节点
 */
export declare function updateToc(params: {
    book_id: number | string;
    action?: "appendNode" | "prependNode" | "editNode" | "removeNode";
    action_mode?: "sibling" | "child";
    type?: "DOC" | "TITLE" | "LINK";
    doc_ids?: number[];
    target_uuid?: string;
    node_uuid?: string;
    title?: string;
}): Promise<string>;
/**
 * 从目录中移除节点（不删除文档）
 */
export declare function removeTocNode(params: {
    book_id: number | string;
    target_uuid: string;
    action_mode?: "sibling" | "child";
}): Promise<string>;
