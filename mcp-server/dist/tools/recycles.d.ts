/**
 * 列出回收站项目
 */
export declare function listRecycles(params: {
    offset?: number;
    limit?: number;
    target_type?: "Doc" | "Note" | "Repo";
}): Promise<string>;
/**
 * 恢复回收站项目
 */
export declare function restoreRecycle(params: {
    recycle_id: number;
}): Promise<string>;
/**
 * 彻底删除回收站项目（不可恢复）
 */
export declare function destroyRecycle(params: {
    recycle_id: number;
}): Promise<string>;
