import { get, post, put } from "../../client.js";
// ============================================================
// 目录增强工具（toc-utils）
// 独立于 docs.ts 的 base CRUD，专注批量操作场景
// ============================================================
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
export async function cloneDocToToc(params) {
    const bookId = params.book_id;
    const mode = params.action_mode || "child";
    // 1. 读取源文档内容
    let sourceTitle;
    let sourceBody;
    try {
        const data = await get(`/repos/${bookId}/docs/${params.doc_id}`);
        const doc = data.data || data;
        sourceTitle = doc.title;
        sourceBody = doc.body;
    }
    catch (e) {
        return JSON.stringify({ error: "READ_SOURCE_FAILED", message: e.message });
    }
    // 2. 在每个目标位置创建副本
    const results = [];
    for (const targetUuid of params.target_uuids) {
        try {
            // 创建文档副本
            const createPayload = {
                title: sourceTitle,
                body: sourceBody,
                format: "markdown",
            };
            const createData = await post(`/repos/${bookId}/docs`, createPayload);
            const newDoc = createData.data || createData;
            const newDocId = newDoc.id;
            // 挂载到目标目录节点
            await put(`/repos/${bookId}/toc`, {
                action: "appendNode",
                action_mode: mode,
                target_uuid: targetUuid,
                type: "DOC",
                doc_ids: [newDocId],
            });
            results.push({ target_uuid: targetUuid, success: true, new_doc_id: newDocId });
        }
        catch (e) {
            results.push({ target_uuid: targetUuid, success: false, error: e.message });
        }
    }
    return JSON.stringify({
        source_doc_id: params.doc_id,
        source_title: sourceTitle,
        total: params.target_uuids.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    }, null, 2);
}
/**
 * 获取知识库目录的扁平化缓存结构
 *
 * 将嵌套 TOC 展平为 {nodes, roots, doc_map}，方便批量操作时快速查找节点，
 * 避免反复调用 yuque_list_toc。
 */
export async function getTocFlat(params) {
    const data = await get(`/repos/${params.book_id}/toc`);
    const toc = data.data || data;
    if (!Array.isArray(toc) || toc.length === 0) {
        return JSON.stringify({ nodes: {}, roots: [], doc_map: {} });
    }
    const nodes = {};
    const docMap = {};
    const roots = [];
    function walk(items, parentUuid) {
        for (const item of items) {
            const node = {
                uuid: item.uuid,
                title: item.title || "",
                type: item.type || "DOC",
                parent_uuid: parentUuid,
                children_uuids: [],
            };
            if (item.doc_id) {
                node.doc_id = item.doc_id;
                docMap[item.uuid] = item.doc_id;
            }
            if (parentUuid === null)
                roots.push(item.uuid);
            if (Array.isArray(item.children)) {
                node.children_uuids = item.children.map((c) => c.uuid);
                walk(item.children, item.uuid);
            }
            nodes[item.uuid] = node;
        }
    }
    walk(toc, null);
    return JSON.stringify({ nodes, roots, doc_map: docMap, total_nodes: Object.keys(nodes).length }, null, 2);
}
//# sourceMappingURL=index.js.map