import { get, put, del } from "../../client.js";
import { cleanToken } from "./utils.js";
import { findDocByTitle, parseIndexDoc, createIndexDoc, titleCache } from "./index.js";
const MAX_BODY_BYTES = 200 * 1024;
/**
 * 将 DocEntry[] 序列化为 Markdown body
 */
function entriesToMarkdown(entries) {
    const blocks = entries.map(e => {
        const title = e.doc_title || "";
        const surface = (e.search_surface || "").trim();
        const summary = (e.summary || "").trim();
        const url = e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`;
        const lines = [];
        lines.push(`# ${title}`);
        if (e.keywords && e.keywords.length > 0) {
            lines.push("");
            lines.push("## 关键词");
            for (const kw of e.keywords) {
                lines.push(kw);
            }
        }
        if (surface) {
            lines.push("");
            lines.push("## 搜索面");
            lines.push(surface);
        }
        if (summary) {
            lines.push("");
            lines.push("## 摘要");
            lines.push(summary);
        }
        if (e.tree && e.tree.sections && e.tree.sections.length > 0) {
            lines.push("");
            lines.push("## 章节树");
            for (const sec of e.tree.sections) {
                lines.push(`- ${sec.id}: ${sec.title} — ${sec.summary}`);
            }
        }
        lines.push("");
        lines.push("## doc_id");
        lines.push(String(e.doc_id));
        lines.push("## 链接");
        lines.push(url);
        lines.push("## 权重");
        lines.push(String(e.weight));
        return lines.join("\n");
    });
    return blocks.join("\n\n") + "\n";
}
/**
 * 增量更新关键词索引文档的 entries
 *
 * 自动完成读-改-写的原子操作。
 * 支持 add（追加）、remove（移除）、update（按 doc_id 合并字段）。
 */
export async function updateIndexEntries(params) {
    const { keyword, index_book_id } = params;
    const cleanKw = cleanToken(keyword);
    const existing = await findDocByTitle(index_book_id, cleanKw);
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
            index_book_id,
        });
    }
    if (!existing) {
        return JSON.stringify({
            keyword: cleanKw,
            action: "noop",
            reason: "索引文档不存在，且未提供 add",
        }, null, 2);
    }
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
                });
                existingIds.add(e.doc_id);
                stats.added++;
            }
        }
    }
    // entries 为空 → 删除索引文档
    if (entries.length === 0) {
        await del(`/repos/${index_book_id}/docs/${existing.id}`);
        titleCache.delete(`${index_book_id}:${cleanKw}`);
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
    await put(`/repos/${index_book_id}/docs/${existing.id}`, {
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