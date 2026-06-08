import { get, post, put } from "../../client.js";
// ============================================================
// 目录增强工具（toc-utils）
// 独立于 docs.ts 的 base CRUD，专注批量操作场景
// ============================================================
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
export async function copyDocsCrossBook(params) {
    const sourceId = params.source_book_id;
    const targetId = params.target_book_id;
    const concurrency = params.concurrency || 3;
    // 1. 获取源库文档列表
    let docList = [];
    if (params.doc_ids && params.doc_ids.length > 0) {
        // 指定了 doc_ids，逐个读取标题
        for (const docId of params.doc_ids) {
            try {
                const data = await get(`/repos/${sourceId}/docs/${docId}`);
                const doc = data.data || data;
                docList.push({ id: docId, title: doc.title || "" });
            }
            catch (e) {
                docList.push({ id: docId, title: `(读取失败: ${e.message})` });
            }
        }
    }
    else {
        // 未指定，获取全部文档
        let offset = 0;
        const limit = 100;
        while (true) {
            const data = await get(`/repos/${sourceId}/docs?offset=${offset}&limit=${limit}&optional_properties=0`);
            const items = data.data || data;
            if (!Array.isArray(items) || items.length === 0)
                break;
            for (const item of items) {
                docList.push({ id: item.id, title: item.title || "" });
            }
            if (items.length < limit)
                break;
            offset += limit;
        }
    }
    if (docList.length === 0) {
        return JSON.stringify({ error: "NO_DOCS", message: "源库没有文档" });
    }
    // 2. 逐篇复制（并发控制）
    const results = [];
    let succeeded = 0;
    let failed = 0;
    let index = 0;
    async function processOne(doc) {
        try {
            // GET 源文档
            const getData = await get(`/repos/${sourceId}/docs/${doc.id}?raw=1`);
            const sourceDoc = getData.data || getData;
            const body = sourceDoc.body || "";
            if (!body) {
                results.push({ doc_id: doc.id, title: doc.title, success: false, error: "EMPTY_BODY" });
                failed++;
                return;
            }
            // CREATE 到目标库
            const createData = await post(`/repos/${targetId}/docs`, {
                title: doc.title,
                body,
                format: "markdown",
            });
            const newDoc = createData.data || createData;
            const newDocId = newDoc.id;
            results.push({ doc_id: doc.id, title: doc.title, success: true, new_doc_id: newDocId });
            succeeded++;
        }
        catch (e) {
            results.push({ doc_id: doc.id, title: doc.title, success: false, error: e.message });
            failed++;
        }
    }
    // 简易并发：每次取 concurrency 个
    while (index < docList.length) {
        const batch = docList.slice(index, index + concurrency);
        await Promise.all(batch.map(processOne));
        index += concurrency;
    }
    return JSON.stringify({
        source_book_id: sourceId,
        target_book_id: targetId,
        total: docList.length,
        succeeded,
        failed,
        results,
    }, null, 2);
}
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
export async function batchMountToc(params) {
    const bookId = params.book_id;
    const batchSize = params.batch_size || 100;
    const entries = Object.entries(params.categories);
    if (entries.length === 0) {
        return JSON.stringify({ error: "NO_CATEGORIES", message: "分类映射为空" });
    }
    // 1. 按文挡数降序排列
    entries.sort((a, b) => b[1].length - a[1].length);
    const results = [];
    // 2. 逐个分类处理
    for (const [catName, docIds] of entries) {
        try {
            // 创建 TITLE 节点
            const tocPayload = {
                action: "appendNode",
                type: "TITLE",
                title: catName,
            };
            if (params.parent_uuid) {
                tocPayload.action_mode = "child";
                tocPayload.target_uuid = params.parent_uuid;
            }
            else {
                tocPayload.action_mode = "sibling";
            }
            await put(`/repos/${bookId}/toc`, tocPayload);
            // 获取新建 TITLE 节点的 UUID
            const tocData = await get(`/repos/${bookId}/toc`);
            const toc = tocData.data || tocData;
            let titleUuid = "";
            for (const item of toc) {
                if (item.type === "TITLE" && item.title === catName) {
                    titleUuid = item.uuid;
                    break;
                }
            }
            if (!titleUuid) {
                results.push({
                    category: catName, title_uuid: "", doc_count: docIds.length,
                    mounted: 0, failed: docIds.length, batches: 0,
                    error: "TITLE_UUID_NOT_FOUND",
                });
                continue;
            }
            // 批量挂载文档
            let mountedTotal = 0;
            let failedTotal = 0;
            let batchCount = 0;
            for (let i = 0; i < docIds.length; i += batchSize) {
                const batch = docIds.slice(i, i + batchSize);
                try {
                    await put(`/repos/${bookId}/toc`, {
                        action: "appendNode",
                        action_mode: "child",
                        type: "DOC",
                        doc_ids: batch,
                        target_uuid: titleUuid,
                    });
                    mountedTotal += batch.length;
                    batchCount++;
                }
                catch (e) {
                    failedTotal += batch.length;
                }
            }
            results.push({
                category: catName,
                title_uuid: titleUuid,
                doc_count: docIds.length,
                mounted: mountedTotal,
                failed: failedTotal,
                batches: batchCount,
            });
        }
        catch (e) {
            results.push({
                category: catName, title_uuid: "", doc_count: docIds.length,
                mounted: 0, failed: docIds.length, batches: 0,
                error: e.message,
            });
        }
    }
    const totalMounted = results.reduce((s, r) => s + r.mounted, 0);
    const totalFailed = results.reduce((s, r) => s + r.failed, 0);
    return JSON.stringify({
        book_id: bookId,
        total_categories: entries.length,
        total_docs: totalMounted + totalFailed,
        mounted: totalMounted,
        failed: totalFailed,
        results,
    }, null, 2);
}
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
export async function batchMountToExistingToc(params) {
    const bookId = params.book_id;
    const batchSize = params.batch_size || 100;
    const entries = Object.entries(params.mapping);
    const results = [];
    for (const [catName, { uuid, doc_ids }] of entries) {
        let mountedTotal = 0;
        let failedTotal = 0;
        let batchCount = 0;
        for (let i = 0; i < doc_ids.length; i += batchSize) {
            const batch = doc_ids.slice(i, i + batchSize);
            try {
                await put(`/repos/${bookId}/toc`, {
                    action: "appendNode",
                    action_mode: "child",
                    type: "DOC",
                    doc_ids: batch,
                    target_uuid: uuid,
                });
                mountedTotal += batch.length;
                batchCount++;
            }
            catch (e) {
                failedTotal += batch.length;
            }
        }
        results.push({
            category: catName, title_uuid: uuid,
            doc_count: doc_ids.length, mounted: mountedTotal,
            failed: failedTotal, batches: batchCount,
        });
    }
    const totalMounted = results.reduce((s, r) => s + r.mounted, 0);
    const totalFailed = results.reduce((s, r) => s + r.failed, 0);
    return JSON.stringify({
        book_id: bookId,
        total_categories: entries.length,
        total_docs: totalMounted + totalFailed,
        mounted: totalMounted,
        failed: totalFailed,
        results,
    }, null, 2);
}
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