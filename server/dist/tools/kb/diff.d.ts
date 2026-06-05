/**
 * 增量对比：读 doc-map → 对比每个源库的 updated_at → 列出变更文档。
 *
 * doc-map 格式：
 * [{"book_id": 70910909, "namespace": "yehuoshun/huwsx0", "last_built": "2026-06-01T00:00:00Z"}]
 *
 * 对比逻辑：
 * 1. 知识库级：GET /repos/{book_id}.updated_at vs last_built → 相同跳过
 * 2. 文档级：list docs → 筛 updated_at > last_built → 返回变更列表
 */
export declare function diffIndex(): Promise<string>;
