import { get, put, del } from "../../client.js";
import { cleanToken } from "./utils.js";
import { findDocByTitle, parseIndexDoc, createIndexDoc, upsertRouteDoc } from "./index.js";
const MAX_BODY_BYTES = 200 * 1024;
/**
 * 增量更新关键词索引文档的 entries
 *
 * 自动完成读-改-写-路由同步的原子操作。
 * 支持 add（追加）、remove（移除）、update（按 doc_id 合并字段）。
 */
export async function updateIndexEntries(params) {
    const { keyword, index_book_id, route_book_id } = params;
    const cleanKw = cleanToken(keyword);
    // 1. 找现有索引文档
    const existing = await findDocByTitle(index_book_id, cleanKw);
    // 不存在 + 只有 remove → 无需操作
    if (!existing && params.remove?.length && !params.add?.length && !params.update?.length) {
        return JSON.stringify({
            keyword: cleanKw,
            action: "noop",
            reason: "索引文档不存在，无需移除",
        }, null, 2);
    }
    // 不存在 + 有 add（无 remove/update）→ 降级 createIndexDoc
    if (!existing && params.add?.length && !params.remove?.length && !params.update?.length) {
        return createIndexDoc({
            keyword: cleanKw,
            entries: params.add,
            index_book_id,
            route_book_id,
        });
    }
    if (!existing) {
        return JSON.stringify({
            keyword: cleanKw,
            action: "noop",
            reason: "索引文档不存在，且未提供 add",
        }, null, 2);
    }
    // 2. 读 body → parse
    const docData = await get(`/repos/${index_book_id}/docs/${existing.id}`);
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
    // 3. 应用 remove（按 doc_id 过滤）
    if (params.remove?.length) {
        const removeSet = new Set(params.remove);
        const before = entries.length;
        entries = entries.filter(e => !removeSet.has(e.doc_id));
        stats.removed = before - entries.length;
    }
    // 4. 应用 update（按 doc_id 匹配，浅合并字段）
    if (params.update?.length) {
        for (const upd of params.update) {
            const idx = entries.findIndex(e => e.doc_id === upd.doc_id);
            if (idx >= 0) {
                entries[idx] = {
                    ...entries[idx],
                    ...(upd.title !== undefined ? { title: upd.title } : {}),
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
    // 5. 应用 add（按 doc_id 去重追加）
    if (params.add?.length) {
        const existingIds = new Set(entries.map(e => e.doc_id));
        for (const e of params.add) {
            if (existingIds.has(e.doc_id)) {
                stats.skipped++;
            }
            else {
                entries.push(e);
                existingIds.add(e.doc_id);
                stats.added++;
            }
        }
    }
    // 6. entries 为空 → 删除索引文档 + 清理总库路由
    if (entries.length === 0) {
        await del(`/repos/${index_book_id}/docs/${existing.id}`);
        if (route_book_id) {
            await removeRouteEntry(route_book_id, cleanKw, Number(index_book_id));
        }
        return JSON.stringify({
            keyword: cleanKw,
            index_doc_id: existing.id,
            action: "deleted",
            entries_before: parsed.entries.length,
            entries_after: 0,
            ...stats,
            deleted: true,
            route_sync: route_book_id ? "已清理" : "未启用",
        }, null, 2);
    }
    // 7. 200KB 检查
    const newBody = JSON.stringify(entries, null, 2);
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
    // 8. PUT 写回子库索引文档
    await put(`/repos/${index_book_id}/docs/${existing.id}`, {
        title: cleanKw,
        body: newBody,
    });
    // 9. 路由同步（确保总库路由文档指向最新）
    if (route_book_id) {
        const subRepo = await get(`/repos/${index_book_id}`);
        const subRepoNs = (subRepo.data || subRepo).namespace || "";
        if (subRepoNs) {
            const updatedDoc = await get(`/repos/${index_book_id}/docs/${existing.id}`);
            const docSlug = (updatedDoc.data || updatedDoc).slug || "";
            if (docSlug) {
                await upsertRouteDoc(route_book_id, cleanKw, Number(index_book_id), `${subRepoNs}/${docSlug}`);
            }
        }
    }
    return JSON.stringify({
        keyword: cleanKw,
        index_doc_id: existing.id,
        action: "updated",
        entries_before: parsed.entries.length,
        entries_after: entries.length,
        ...stats,
        deleted: false,
        route_sync: route_book_id ? "已同步" : "未启用",
    }, null, 2);
}
/**
 * 从总库路由文档中移除指定子索引库的条目
 * 如果路由文档 entries 清空，则删除路由文档本身
 */
async function removeRouteEntry(routeBookId, keyword, subBookId) {
    const existing = await findDocByTitle(routeBookId, keyword);
    if (!existing)
        return;
    // GET 读路由文档
    const docData = await get(`/repos/${routeBookId}/docs/${existing.id}`);
    const rawBody = (docData.data || docData).body || "";
    let list = [];
    try {
        const parsed = JSON.parse(rawBody);
        list = Array.isArray(parsed) ? parsed : [];
    }
    catch {
        // body 损坏，直接删除路由文档
        await del(`/repos/${routeBookId}/docs/${existing.id}`);
        return;
    }
    const filtered = list.filter((e) => String(e.book_id) !== String(subBookId));
    if (filtered.length === 0) {
        // 路由文档无剩余条目 → DELETE
        await del(`/repos/${routeBookId}/docs/${existing.id}`);
    }
    else {
        // PUT 写回
        await put(`/repos/${routeBookId}/docs/${existing.id}`, {
            title: keyword,
            body: JSON.stringify(filtered),
        });
    }
}
//# sourceMappingURL=update.js.map