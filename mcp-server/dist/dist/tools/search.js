import { get } from "../client.js";
/**
 * 搜索语雀内容
 * @param query 搜索关键词
 * @param scope 搜索范围 namespace（可选，默认全库）
 * @param type 搜索类型（默认 doc）
 * @param page 页码（默认 1）
 */
export async function search(params) {
    const q = encodeURIComponent(params.query);
    const type = params.type || "doc";
    const page = params.page ?? 1;
    let url = `/search?q=${q}&type=${type}&page=${page}`;
    if (params.scope) {
        url += `&scope=${params.scope}`;
    }
    const data = await get(url);
    const body = data;
    const results = body.data || body;
    if (!Array.isArray(results) || results.length === 0) {
        return `未找到「${params.query}」的相关内容`;
    }
    const lines = results.map((r) => {
        const info = r.target || r;
        return `- **${info.title || r.title}** (id=${info.id || r.id}, book_id=${info.book?.id || r.book_id})\n  ${(info.description || r.description || "").slice(0, 120)}`;
    });
    return `搜索「${params.query}」结果 (page=${page}):\n\n${lines.join("\n\n")}`;
}
//# sourceMappingURL=search.js.map