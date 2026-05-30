import { get } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 批量获取多篇文档的 Markdown body
 * 底层走 get_doc API（export 端点已不存在于语雀 v2 API）
 */
export async function batchGetDocsBody(params) {
    const results = [];
    const config = loadConfig();
    const concurrency = config.search_concurrency || 5;
    for (let i = 0; i < params.docs.length; i += concurrency) {
        const batch = params.docs.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(async ({ book_id, doc_id }) => {
            try {
                const data = await get(`/repos/${book_id}/docs/${doc_id}`);
                const doc = data.data || data;
                return {
                    doc_id,
                    title: doc.title || "",
                    body: doc.body || "",
                    format: doc.format || "unknown",
                };
            }
            catch (e) {
                return {
                    doc_id,
                    title: "",
                    body: "",
                    format: "unknown",
                    error: e.message || String(e),
                };
            }
        }));
        results.push(...batchResults);
    }
    return JSON.stringify({
        total: results.length,
        success: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
        results,
    }, null, 2);
}
//# sourceMappingURL=export.js.map