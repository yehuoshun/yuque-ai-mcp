/**
 * 列出知识库分组（仪表盘视图，需 Cookie 登录态）
 * 端点: GET https://www.yuque.com/api/mine/book_stacks（v2 API 没有此端点）
 */
export declare function listRepoGroups(): Promise<string>;
