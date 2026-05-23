import { get, getRaw, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 列出知识库内的文档
 */
export async function listDocs(params) {
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    const data = await get(`/repos/${params.book_id}/docs?offset=${offset}&limit=${Math.min(limit, 100)}`);
    const docs = data.data || data;
    if (!Array.isArray(docs) || docs.length === 0)
        return "暂无文档";
    const lines = docs.map((d) => `- [${d.title}](${d.slug}) id=${d.id}`);
    return lines.join("\n");
}
/**
 * 获取文档详情（Markdown）
 */
export async function getDoc(params) {
    const raw = params.raw !== false;
    if (raw) {
        return await getRaw(`/repos/${params.book_id}/docs/${params.doc_id}`);
    }
    const data = await get(`/repos/${params.book_id}/docs/${params.doc_id}`);
    return JSON.stringify(data.data || data, null, 2);
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
 * 更新知识库目录（挂载文档）
 */
export async function updateToc(params) {
    await put(`/repos/${params.book_id}/toc`, {
        action: params.action || "appendNode",
        action_mode: "sibling",
        type: "DOC",
        doc_ids: params.doc_ids,
    });
    return `✅ 目录已更新`;
}
//# sourceMappingURL=docs.js.map