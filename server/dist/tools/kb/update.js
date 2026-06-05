import { get, put, del } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, entriesToMarkdown } from "./utils.js";
import { parseIndexDoc, createIndexDoc } from "./index.js";
const MAX_BODY_BYTES = 200 * 1024;
/**
 * 增量更新关键词索引文档的 entries
 *
 * 自动完成读-改-写的原子操作。
 * 支持 add（追加）、remove（移除）、update（按 doc_id 合并字段）。
 */
export async function updateIndexEntries(params) {
    const { keyword } = params;
    const cleanKw = cleanToken(keyword);
    const { route_books } = loadConfig();
    const bookId = route_books[0]?.book_id;
    if (!bookId) {
        return JSON.stringify({ keyword: cleanKw, action: "error", error: "route_books 未配置" }, null, 2);
    }
    // v3: 用语雀搜索 API 查关键词索引文档是否已存在
    const routeBook = route_books.find(b => String(b.book_id) === String(bookId));
    let existing = null;
    if (routeBook) {
        try {
            const searchData = await get(`/search?q=${encodeURIComponent(cleanKw)}&type=doc&scope=${routeBook.namespace}`);
            const results = searchData.data || [];
            const match = results.find((r) => {
                const info = r.target || r;
                return (info.title || r.title || "").trim() === cleanKw;
            });
            if (match) {
                const info = match.target || match;
                existing = { id: info.id || match.id, slug: info.slug || match.slug || "" };
            }
        }
        catch { /* 搜索失败 */ }
    }
    if (!existing && params.remove?.length && !params.add?.length && !params.update?.length) {
        return JSON.stringify({
            keyword: cleanKw,
            action: "noop",
            reason: "索引文档不存在，无需移除",
        }, null, 2);
    }
    if (!existing && params.add?.length && !params.remove?.length && !params.update?.length) {
        return createIndexDoc({
            keyword: cleanKw,
            entries: params.add,
        });
    }
    if (!existing) {
        return JSON.stringify({
            keyword: cleanKw,
            action: "noop",
            reason: "索引文档不存在",
            hint: params.add?.length ? "文档不存在且含非纯新增操作（remove/update），请先创建索引文档或仅使用 add" : "文档不存在",
        }, null, 2);
    }
    const docData = await get(`/repos/${bookId}/docs/${existing.id}`);
    const body = (docData.data || docData).body || "";
    const parsed = parseIndexDoc(body);
    if (parsed.parse_error) {
        return JSON.stringify({
            keyword: cleanKw,
            index_doc_id: existing.id,
            action: "error",
            error: `索引文档 body 解析失败: ${parsed.parse_error}`,
        }, null, 2);
    }
    let entries = parsed.entries;
    const stats = { added: 0, removed: 0, updated: 0, skipped: 0 };
    // 应用 remove
    if (params.remove?.length) {
        const removeSet = new Set(params.remove);
        const before = entries.length;
        entries = entries.filter(e => !removeSet.has(e.doc_id));
        stats.removed = before - entries.length;
    }
    // 应用 update
    if (params.update?.length) {
        for (const upd of params.update) {
            const idx = entries.findIndex(e => e.doc_id === upd.doc_id);
            if (idx >= 0) {
                entries[idx] = {
                    ...entries[idx],
                    ...(upd.doc_title !== undefined ? { doc_title: upd.doc_title } : {}),
                    ...(upd.slug !== undefined ? { slug: upd.slug } : {}),
                    ...(upd.url !== undefined ? { url: upd.url } : {}),
                    ...(upd.weight !== undefined ? { weight: upd.weight } : {}),
                    ...(upd.keywords !== undefined ? { keywords: upd.keywords } : {}),
                    ...(upd.search_surface !== undefined ? { search_surface: upd.search_surface } : {}),
                    ...(upd.summary !== undefined ? { summary: upd.summary } : {}),
                    ...(upd.tree !== undefined ? { tree: upd.tree } : {}),
                };
                stats.updated++;
            }
        }
    }
    // 应用 add
    if (params.add?.length) {
        const existingIds = new Set(entries.map(e => e.doc_id));
        for (const e of params.add) {
            if (existingIds.has(e.doc_id)) {
                stats.skipped++;
            }
            else {
                entries.push({
                    doc_id: e.doc_id,
                    namespace: e.namespace,
                    doc_title: e.doc_title,
                    slug: e.slug,
                    url: e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`,
                    weight: e.weight,
                    keywords: e.keywords,
                    search_surface: e.search_surface,
                    summary: e.summary,
                    tree: e.tree,
                });
                existingIds.add(e.doc_id);
                stats.added++;
            }
        }
    }
    // entries 为空 → 删除索引文档
    if (entries.length === 0) {
        await del(`/repos/${bookId}/docs/${existing.id}`);
        return JSON.stringify({
            keyword: cleanKw,
            index_doc_id: existing.id,
            action: "deleted",
            entries_before: parsed.entries.length,
            entries_after: 0,
            ...stats,
            deleted: true,
        }, null, 2);
    }
    const newBody = entriesToMarkdown(entries);
    const bodyBytes = Buffer.byteLength(newBody, "utf-8");
    if (bodyBytes > MAX_BODY_BYTES) {
        return JSON.stringify({
            keyword: cleanKw,
            index_doc_id: existing.id,
            action: "error",
            error: "body_too_large",
            body_bytes: bodyBytes,
            limit_bytes: MAX_BODY_BYTES,
            entry_count: entries.length,
            hint: `合并后 body ${(bodyBytes / 1024).toFixed(1)}KB 超过 ${MAX_BODY_BYTES / 1024}KB 上限。建议拆分关键词。`,
        }, null, 2);
    }
    await put(`/repos/${bookId}/docs/${existing.id}`, {
        title: cleanKw,
        body: newBody,
    });
    return JSON.stringify({
        keyword: cleanKw,
        index_doc_id: existing.id,
        action: "updated",
        entries_before: parsed.entries.length,
        entries_after: entries.length,
        ...stats,
        deleted: false,
    }, null, 2);
}
//# sourceMappingURL=update.js.map