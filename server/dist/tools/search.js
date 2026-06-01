import { get } from "../client.js";
/**
 * 搜索语雀内容
 *
 * 返回 Markdown 文本：分页信息 + 去重结果列表
 *
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
    const meta = body.meta || {};
    if (!Array.isArray(results) || results.length === 0) {
        return `未找到「${params.query}」的相关内容`;
    }
    // 按 doc_id 去重（同一文档可能被多种理由匹配）
    const seen = new Set();
    const unique = [];
    for (const r of results) {
        const info = r.target || r;
        const id = info.id || r.id;
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        unique.push({
            id,
            title: info.title || r.title || "",
            book_id: info.book?.id || r.book_id,
            description: (info.description || r.description || "").slice(0, 120),
            url: info.slug
                ? `https://www.yuque.com/${info.book?.namespace || ""}/${info.slug}`
                : undefined,
        });
    }
    const total = meta.total || unique.length;
    const hasMore = total > page * 20;
    const lines = [`搜索「${params.query}」结果 (page=${page}, 共 ${total} 条):`, ""];
    for (let i = 0; i < unique.length; i++) {
        const r = unique[i];
        lines.push(`${i + 1}. **${r.title}** (id=${r.id}, book_id=${r.book_id})`);
        if (r.url)
            lines.push(`   ${r.url}`);
        if (r.description)
            lines.push(`   ${r.description}`);
        lines.push("");
    }
    if (hasMore) {
        lines.push(`_(更多结果见 page=${page + 1})_`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=search.js.map