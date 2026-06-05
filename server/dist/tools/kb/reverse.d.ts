/**
 * 反向查找：给定源文档 doc_id，找出索引库中所有包含它的关键词索引文档。
 *
 * 用语雀搜索 API 搜索引库 body 中的 doc_id 数字
 * → 读命中的索引文档 → parseIndexDoc → 过滤 entry.doc_id === doc_id
 */
export declare function reverseLookup(params: {
    doc_id: number;
}): Promise<string>;
