/**
 * 列出群组成员
 */
export declare function listGroupUsers(params: {
    login: string;
    role?: 0 | 1 | 2;
    offset?: number;
}): Promise<string>;
/**
 * 更新群组成员角色
 */
export declare function updateGroupUser(params: {
    login: string;
    user_id: number;
    role: 0 | 1 | 2;
}): Promise<string>;
/**
 * 移除群组成员
 */
export declare function removeGroupUser(params: {
    login: string;
    user_id: number;
}): Promise<string>;
