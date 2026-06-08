/**
 * 跨知识库批量复制文档（源库不动，只复制到目标库）
 *
 * 场景：A 库整理到 B 库，A 库保留不动。
 * 逐个 GET 源文档 → CREATE 到目标库，不删除源库。
 *
 * @param source_book_id - 源知识库 ID
 * @param target_book_id - 目标知识库 ID
 * @param doc_ids - 可选，指定要复制的文档 ID 列表；不传则复制全部
 * @param concurrency - 并发数，默认 3
 * @returns 迁移结果摘要
 */
export declare function copyDocsCrossBook(params: {
    source_book_id: number | string;
    target_book_id: number | string;
    doc_ids?: number[];
    concurrency?: number;
}): Promise<string>;
/**
 * 将文档内容复制到多个目录位置（多目录支持）
 *
 * 语雀 TOC 是 1:1 的（一个文档只能在一个节点），所以"多目录"通过物理复制实现：
 * 读取源文档内容 → 在每个目标分类下创建独立的副本，每个副本挂到对应目录节点。
 *
 * @param book_id - 目标知识库
 * @param doc_id - 源文档 ID（要复制的文档）
 * @param target_uuids - TOC 父节点 UUID 列表，每个位置创建一个副本
 * @param action_mode - 挂载模式，默认 "child"
 * @returns 每个副本的 doc_id 和挂载结果
 */
export declare function cloneDocToToc(params: {
    book_id: number | string;
    doc_id: number;
    target_uuids: string[];
    action_mode?: "sibling" | "child";
}): Promise<string>;
/**
 * 获取知识库目录的扁平化缓存结构
 *
 * 将嵌套 TOC 展平为 {nodes, roots, doc_map}，方便批量操作时快速查找节点，
 * 避免反复调用 yuque_list_toc。
 */
export declare function getTocFlat(params: {
    book_id: number | string;
}): Promise<string>;
