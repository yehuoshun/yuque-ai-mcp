import { get, getRaw } from "../client.js";
/**
 * 导出单篇文档为 Markdown 内容
 */
export async function exportDoc(params) {
    const markdown = await getRaw(`/repos/${params.book_id}/docs/${params.doc_id}`);
    return markdown;
}
/**
 * 批量导出知识库的文档列表
 */
export async function listDocsForExport(params) {
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    const data = await get(`/repos/${params.book_id}/docs?offset=${offset}&limit=${Math.min(limit, 100)}`);
    const docs = data.data || data;
    if (!Array.isArray(docs) || docs.length === 0)
        return JSON.stringify([]);
    return JSON.stringify(docs.map((d) => ({ id: d.id, title: d.title, slug: d.slug })), null, 2);
}
//# sourceMappingURL=export.js.map