/**
 * 团队整体统计
 */
export declare function getGroupStats(params: {
    login: string;
}): Promise<string>;
/**
 * 团队成员统计
 */
export declare function getMemberStats(params: {
    login: string;
    name?: string;
    range?: 0 | 30 | 365;
    page?: number;
    limit?: number;
    sortField?: "write_doc_count" | "write_count" | "read_count" | "like_count";
    sortOrder?: "desc" | "asc";
}): Promise<string>;
/**
 * 团队知识库统计
 */
export declare function getBookStats(params: {
    login: string;
    name?: string;
    range?: 0 | 30 | 365;
    page?: number;
    limit?: number;
    sortField?: "content_updated_at_ms" | "word_count" | "post_count" | "read_count" | "like_count" | "watch_count" | "comment_count";
    sortOrder?: "desc" | "asc";
}): Promise<string>;
/**
 * 团队文档统计
 */
export declare function getDocStats(params: {
    login: string;
    bookId?: number;
    name?: string;
    range?: 0 | 30 | 365;
    page?: number;
    limit?: number;
    sortField?: "content_updated_at" | "word_count" | "read_count" | "like_count" | "comment_count" | "created_at";
    sortOrder?: "desc" | "asc";
}): Promise<string>;
