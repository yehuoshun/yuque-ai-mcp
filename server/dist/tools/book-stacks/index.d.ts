/**
 * 列出知识库分组（仪表盘视图）
 * GET https://www.yuque.com/api/mine/book_stacks
 */
export declare function listBookStacks(): Promise<string>;
/**
 * 创建知识库分组
 * POST https://www.yuque.com/api/mine/book_stack
 */
export declare function createBookStack(args: {
    name: string;
    target_rank?: number;
}): Promise<string>;
/**
 * 更新知识库分组（改名）
 * PUT https://www.yuque.com/api/book_stacks/{stack_id}
 */
export declare function updateBookStack(args: {
    stack_id: number;
    name: string;
}): Promise<string>;
/**
 * 排序知识库分组
 * PUT https://www.yuque.com/api/book_stacks/{stack_id}/sort
 */
export declare function sortBookStacks(args: {
    stack_id: number;
    target_rank: number;
}): Promise<string>;
/**
 * 移动知识库到指定分组
 * PUT https://www.yuque.com/api/mine/book_stack/move
 */
export declare function moveBooks(args: {
    targetStackId: number;
    sourceStackId: number;
    sourceBookIds: number[];
    targetBookIds?: number[];
}): Promise<string>;
