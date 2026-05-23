import { get, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 列出知识库内的文档（返回结构化 JSON，不含 body 以节省 token）
 */
export async function listDocs(params) {
    const offset = params.offset ?? 0;
    const limit = Math.min(params.limit ?? 100, 100);
    let url = `/repos/${params.book_id}/docs?offset=${offset}&limit=${limit}`;
    if (params.optional_properties)
        url += `&optional_properties=${params.optional_properties}`;
    const data = await get(url);
    const docs = data.data || data;
    if (!Array.isArray(docs) || docs.length === 0)
        return JSON.stringify([]);
    return JSON.stringify(docs.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        public: d.public,
        word_count: d.word_count,
        updated_at: d.updated_at,
        ...(d.content_updated_at ? { content_updated_at: d.content_updated_at } : {}),
    })), null, 2);
}
/**
 * 获取文档详情
 */
export async function getDoc(params) {
    const data = await get(`/repos/${params.book_id}/docs/${params.doc_id}`);
    const doc = data.data || data;
    const b = doc.book || {};
    return JSON.stringify({
        id: doc.id,
        type: doc.type,
        book_id: doc.book_id,
        title: doc.title,
        slug: doc.slug,
        description: doc.description,
        cover: doc.cover,
        format: doc.format,
        public: doc.public,
        status: doc.status,
        // 各格式正文
        body: doc.body,
        body_draft: doc.body_draft,
        body_html: doc.body_html,
        body_lake: doc.body_lake,
        body_sheet: doc.body_sheet,
        body_table: doc.body_table,
        // 统计
        word_count: doc.word_count,
        read_count: doc.read_count,
        likes_count: doc.likes_count,
        comments_count: doc.comments_count,
        // 时间
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        content_updated_at: doc.content_updated_at,
        published_at: doc.published_at,
        // 关联
        book: { id: b.id, name: b.name, namespace: b.namespace },
        latest_version_id: doc.latest_version_id,
    }, null, 2);
}
/**
 * 创建文档（自动挂 TOC）
 */
export async function createDoc(params) {
    const { default_book } = loadConfig();
    const bookId = params.book_id || default_book.book_id;
    if (!bookId)
        throw new Error("未指定 book_id 且未配置 default_book");
    const payload = {
        title: params.title,
        body: params.body,
        format: params.format || "markdown",
    };
    if (params.slug)
        payload.slug = params.slug;
    if (params.public !== undefined)
        payload.public = params.public;
    const data = await post(`/repos/${bookId}/docs`, payload);
    const doc = data.data || data;
    const docId = doc.id;
    // 自动挂载到目录
    try {
        await put(`/repos/${bookId}/toc`, {
            action: "appendNode",
            action_mode: "sibling",
            type: "DOC",
            doc_ids: [docId],
        });
    }
    catch (e) {
        return `⚠️ 文档已创建 (id=${docId})，但挂载目录失败: ${e.message}`;
    }
    return `✅ 文档已创建: ${params.title} (id=${docId})`;
}
/**
 * 更新文档
 */
export async function updateDoc(params) {
    const payload = {};
    if (params.title)
        payload.title = params.title;
    if (params.body !== undefined)
        payload.body = params.body;
    if (params.slug)
        payload.slug = params.slug;
    if (params.format)
        payload.format = params.format;
    if (params.public !== undefined)
        payload.public = params.public;
    await put(`/repos/${params.book_id}/docs/${params.doc_id}`, payload);
    return `✅ 文档已更新: id=${params.doc_id}`;
}
/**
 * 删除文档
 */
export async function deleteDoc(params) {
    await del(`/repos/${params.book_id}/docs/${params.doc_id}`);
    return `✅ 文档已删除: id=${params.doc_id}`;
}
// ---------- 版本 ----------
/**
 * 获取文档版本列表
 */
export async function listDocVersions(params) {
    const data = await get(`/doc_versions?doc_id=${params.doc_id}`);
    const versions = data.data || data;
    if (!Array.isArray(versions) || versions.length === 0)
        return "暂无版本记录";
    const lines = versions.map((v) => `- v${v.id} — ${v.title || "无标题"} (${v.created_at || ""}) by ${v.user?.name || "未知"}`);
    return lines.join("\n");
}
/**
 * 获取文档版本详情
 */
export async function getDocVersion(params) {
    const data = await get(`/doc_versions/${params.version_id}`);
    const v = data.data || data;
    return `# ${v.title || "无标题"}\n\n${v.body || v.body_draft || "(空内容)"}`;
}
// ---------- 目录（TOC）----------
/**
 * 列出知识库目录
 */
export async function listToc(params) {
    const data = await get(`/repos/${params.book_id}/toc`);
    const toc = data.data || data;
    return JSON.stringify(toc, null, 2);
}
/**
 * 更新知识库目录
 * action: appendNode=尾插 prependNode=头插 editNode=编辑节点 removeNode=删除节点
 * action_mode: sibling=同级 child=子节点
 */
export async function updateToc(params) {
    const payload = {
        action: params.action || "appendNode",
        action_mode: params.action_mode || "sibling",
        type: params.type || "DOC",
    };
    if (params.doc_ids)
        payload.doc_ids = params.doc_ids;
    if (params.node_uuid)
        payload.node_uuid = params.node_uuid;
    // appendNode/prependNode 用 target_uuid 表示插入位置
    // editNode/removeNode 用 node_uuid 表示操作对象
    if (params.target_uuid) {
        const action = params.action || "appendNode";
        if (action === "editNode" || action === "removeNode") {
            payload.node_uuid = params.node_uuid || params.target_uuid;
        }
        else {
            payload.target_uuid = params.target_uuid;
        }
    }
    if (params.title)
        payload.title = params.title;
    await put(`/repos/${params.book_id}/toc`, payload);
    return `✅ 目录已更新 (action=${payload.action})`;
}
/**
 * 从目录中移除节点（不删除文档）
 */
export async function removeTocNode(params) {
    await put(`/repos/${params.book_id}/toc`, {
        action: "removeNode",
        action_mode: "sibling",
        node_uuid: params.target_uuid,
    });
    return `✅ 节点已从目录移除: ${params.target_uuid}`;
}
//# sourceMappingURL=docs.js.map