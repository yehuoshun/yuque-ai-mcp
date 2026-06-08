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
 * 批量挂载文档到目录分类（一步到位的 TOC 构建工具）
 *
 * 场景：知识库整理后，将所有文档按分类挂载到目录节点下。
 * 1. 先创建 TITLE 节点（如果指定了 parent_uuid，创建为子节点）
 * 2. 再将文档按分类批量挂载到对应 TITLE 下
 *
 * @param book_id - 目标知识库
 * @param categories - 分类映射 {分类名: [doc_id, ...]}
 * @param parent_uuid - 可选，父 TITLE 的 UUID（用于创建子 TITLE）
 * @param batch_size - 每批挂载的文档数，默认 100
 * @returns 每个分类的挂载结果
 */
export declare function batchMountToc(params: {
    book_id: number | string;
    categories: Record<string, number[]>;
    parent_uuid?: string;
    batch_size?: number;
}): Promise<string>;
/**
 * 批量挂载文档到多个目录分类（支持已有的 TITLE UUID 映射）
 *
 * 与 batchMountToc 不同，此函数使用已有的 TITLE UUID，不创建新节点。
 * 适用于已经创建了目录结构，只需要挂载文档的场景。
 *
 * @param book_id - 目标知识库
 * @param mapping - UUID 映射 {分类名: {uuid: TITLE_UUID, doc_ids: [doc_id, ...]}}
 * @param batch_size - 每批挂载的文档数，默认 100
 * @returns 每个分类的挂载结果
 */
export declare function batchMountToExistingToc(params: {
    book_id: number | string;
    mapping: Record<string, {
        uuid: string;
        doc_ids: number[];
    }>;
    batch_size?: number;
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
