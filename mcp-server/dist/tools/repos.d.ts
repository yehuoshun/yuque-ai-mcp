/**
 * 列出用户的所有知识库
 */
export declare function listRepos(): Promise<string>;
/**
 * 获取知识库详情
 */
export declare function getRepo(params: {
    id_or_namespace: string;
}): Promise<string>;
/**
 * 创建知识库
 */
export declare function createRepo(params: {
    name: string;
    slug?: string;
}): Promise<string>;
/**
 * 删除知识库
 */
export declare function deleteRepo(params: {
    id_or_namespace: string;
}): Promise<string>;
