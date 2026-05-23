/**
 * 列出小记
 */
export declare function listNotes(params: {
    page?: number;
    limit?: number;
    status?: number;
}): Promise<string>;
/**
 * 获取小记详情
 */
export declare function getNote(params: {
    note_id: number;
}): Promise<string>;
/**
 * 创建小记
 */
export declare function createNote(params: {
    body: string;
}): Promise<string>;
/**
 * 更新小记（需要先 GET 原内容再 PUT）
 */
export declare function updateNote(params: {
    note_id: number;
    body?: string;
    title?: string;
}): Promise<string>;
/**
 * 删除小记（软删除 status=9）
 */
export declare function deleteNote(params: {
    note_id: number;
}): Promise<string>;
/**
 * 恢复小记（status=0）
 */
export declare function restoreNote(params: {
    note_id: number;
}): Promise<string>;
