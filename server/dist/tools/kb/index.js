import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken } from "./utils.js";
import { listAllDocs } from "./search.js";
// 容量上限（语雀单库文档上限约 5000）
const REPO_DOC_LIMIT = 5000;
// 扩容阈值：到达此比例时提示需要新建子库
const REPO_CAPACITY_WARN_PCT = 90;
// 阻塞阈值：到达此比例时拒绝写入
const REPO_CAPACITY_BLOCK_PCT = 97;
/** 检查知识库容量，返回 { count, pct, level: ok|warn|block } */
async function checkRepoCapacity(bookId) {
    try {
        const data = await get(`/repos/${bookId}`);
        const repo = data.data || data;
        const count = repo.items_count || 0;
        const pct = Math.round((count / REPO_DOC_LIMIT) * 1000) / 10;
        const name = repo.name || String(bookId);
        if (count >= REPO_DOC_LIMIT * (REPO_CAPACITY_BLOCK_PCT / 100)) {
            return { count, pct, level: "block", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
        }
        if (count >= REPO_DOC_LIMIT * (REPO_CAPACITY_WARN_PCT / 100)) {
            return { count, pct, level: "warn", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
        }
        return { count, pct, level: "ok", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
    }
    catch {
        return { count: 0, pct: 0, level: "ok", label: String(bookId) };
    }
}
/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 JSON 数组，每项为一个 DocEntry。
 */
export async function createIndexDoc(params) {
    const { keyword, entries, index_book_id, route_book_id } = params;
    if (!keyword)
        throw new Error("keyword 不能为空");
    if (!entries || entries.length === 0)
        throw new Error("entries 不能为空");
    const cleanKw = cleanToken(keyword);
    // 校验必填字段
    for (const e of entries) {
        if (!e.doc_id)
            throw new Error("每个 entry 必须有 doc_id");
        if (!e.namespace)
            throw new Error("每个 entry 必须有 namespace");
        if (!e.doc_title)
            throw new Error("每个 entry 必须有 doc_title（源文档标题）");
        if (!e.slug)
            throw new Error("每个 entry 必须有 slug");
        if (e.weight == null || e.weight < 1 || e.weight > 10)
            throw new Error("每个 entry 必须有 weight（权重 1-10）");
    }
    // 补全 url（写入时自动从 namespace + slug 拼接兜底）
    const enrichedEntries = entries.map(e => ({
        doc_id: e.doc_id,
        namespace: e.namespace,
        doc_title: e.doc_title,
        slug: e.slug,
        url: e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`,
        weight: e.weight,
        title: e.title,
        keywords: e.keywords,
        search_surface: e.search_surface,
        summary: e.summary,
        tree: e.tree,
    }));
    // body = JSON 数组，agent 直接 JSON.parse
    const body = JSON.stringify(enrichedEntries, null, 2);
    // 200KB 上限检查（语雀上限 500KB，留余量防读取超时）
    const MAX_BODY_BYTES = 200 * 1024;
    const bodyBytes = Buffer.byteLength(body, "utf-8");
    if (bodyBytes > MAX_BODY_BYTES) {
        return JSON.stringify({
            created: false,
            error: "body_too_large",
            body_bytes: bodyBytes,
            limit_bytes: MAX_BODY_BYTES,
            entry_count: enrichedEntries.length,
            hint: `索引文档 body ${(bodyBytes / 1024).toFixed(1)}KB 超过 ${MAX_BODY_BYTES / 1024}KB 上限。建议：1) 拆分关键词（如 SpringBoot-1, SpringBoot-2）2) 减少低权重 entry（weight < 5 的可考虑不收录）`,
        }, null, 2);
    }
    const config = loadConfig();
    const { route_book, route_book_sub, default_book } = config;
    if (index_book_id) {
        const matched = route_book_sub.some(b => String(b.book_id) === String(index_book_id));
        if (!matched) {
            const validIds = route_book_sub.map(b => `${b.book_id}（${b.namespace}）`).join(", ");
            return JSON.stringify({
                created: false,
                error: `index_book_id=${index_book_id} 不在配置的 route_book_sub 中`,
                valid_book_ids: route_book_sub.map(b => ({ book_id: b.book_id, namespace: b.namespace })),
                hint: `请使用配置中已有的子索引库：${validIds || "（无）"}。如需新建子索引库，先用 yuque_create_repo + yuque_config_update。`,
            });
        }
    }
    if (route_book_id) {
        const matched = route_book.some(b => String(b.book_id) === String(route_book_id));
        if (!matched) {
            const validIds = route_book.map(b => `${b.book_id}（${b.namespace}）`).join(", ");
            return JSON.stringify({
                created: false,
                error: `route_book_id=${route_book_id} 不在配置的 route_book 中`,
                valid_book_ids: route_book.map(b => ({ book_id: b.book_id, namespace: b.namespace })),
                hint: `请使用配置中已有的总库：${validIds || "（无）"}。如需新建总库，先用 yuque_create_repo + yuque_config_update。`,
            });
        }
    }
    const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
    if (!bookId) {
        return JSON.stringify({
            created: false,
            error: "route_book_sub 未配置",
            hint: "子索引库未配置。请先创建子索引库并写入 config 的 route_book_sub。",
        });
    }
    const capacity = await checkRepoCapacity(bookId);
    if (capacity.level === "block") {
        return JSON.stringify({
            created: false,
            error: "capacity_blocked",
            current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
            hint: `子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线，需要新建子索引库。`,
        });
    }
    const capacityWarning = capacity.level === "warn"
        ? `⚠️ 子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线`
        : "";
    // 子库写入幂等：重试时已有同名文档则覆盖，不重复创建
    let docId;
    let docSlug;
    let isNew = false;
    const existingSubDoc = await findDocByTitle(bookId, cleanKw);
    if (existingSubDoc) {
        await put(`/repos/${bookId}/docs/${existingSubDoc.id}`, {
            title: cleanKw,
            body,
        });
        docId = existingSubDoc.id;
        // PUT 不返回 slug，需单独读
        const docData = await get(`/repos/${bookId}/docs/${docId}`);
        docSlug = (docData.data || docData).slug || "";
    }
    else {
        const data = await post(`/repos/${bookId}/docs`, {
            title: cleanKw,
            body,
            format: "markdown",
        });
        const created = data.data || data;
        docId = created.id;
        docSlug = created.slug || "";
        isNew = true;
    }
    if (!docSlug) {
        throw new Error(`无法获取索引文档 slug（doc_id=${docId}），路由同步中断`);
    }
    if (isNew) {
        await put(`/repos/${bookId}/toc`, {
            action: "appendNode",
            action_mode: "child",
            target_uuid: "",
            type: "DOC",
            doc_ids: [docId],
        });
    }
    // 路由同步：子库索引文档写入成功后在总库创建路由指针
    // 总库路由文档 body 是 JSON 数组 [{book_id, namespace}]，
    // namespace 是文档级路径（group/slug/slug），指向子库中的具体索引文档
    if (route_book_id) {
        const subRepo = await get(`/repos/${bookId}`);
        const subRepoNs = (subRepo.data || subRepo).namespace || "";
        if (!subRepoNs) {
            throw new Error(`无法获取子索引库 namespace（book_id=${bookId}），路由同步中断`);
        }
        const docNs = `${subRepoNs}/${docSlug}`;
        await upsertRouteDoc(route_book_id, cleanKw, Number(bookId), docNs);
    }
    return JSON.stringify({
        created: isNew,
        updated: !isNew,
        doc_id: docId,
        keyword: cleanKw,
        total_entries: entries.length,
        book_id: bookId,
        route_sync: route_book_id ? "已同步" : "未启用",
        ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
    }, null, 2);
}
/** 按标题查找总库/子库中已存在的文档（用于幂等） */
export async function findDocByTitle(bookId, title) {
    const allDocs = await listAllDocs(bookId);
    const found = allDocs.find((d) => (d.title || "").trim() === title);
    return found ? { id: found.id } : null;
}
/**
 * 总库路由文档 upsert：body 为 JSON 数组 [{book_id, namespace}]，
 * namespace 是文档级路径（group/slug/slug），指向子库中的具体索引文档。
 * 按 book_id 去重合并，不覆盖已有其他子库的指针。
 */
export async function upsertRouteDoc(routeBookId, keyword, subBookId, docNs) {
    const existing = await findDocByTitle(routeBookId, keyword);
    const newEntry = { book_id: subBookId, namespace: docNs };
    if (existing) {
        // 已有路由文档：读 body → 合并数组 → 写回
        const docData = await get(`/repos/${routeBookId}/docs/${existing.id}`);
        const rawBody = (docData.data || docData).body || "";
        let list = [];
        try {
            const parsed = JSON.parse(rawBody);
            list = Array.isArray(parsed) ? parsed : [];
        }
        catch { /* body 损坏则重建 */ }
        // 按 book_id 去重 upsert
        const idx = list.findIndex((e) => String(e.book_id) === String(subBookId));
        if (idx >= 0) {
            list[idx] = newEntry;
        }
        else {
            list.push(newEntry);
        }
        await put(`/repos/${routeBookId}/docs/${existing.id}`, {
            title: keyword,
            body: JSON.stringify(list),
        });
    }
    else {
        // 新建路由文档
        await post(`/repos/${routeBookId}/docs`, {
            title: keyword,
            body: JSON.stringify([newEntry]),
            format: "markdown",
        });
    }
}
/**
 * 解析索引文档 body → entries
 *
 * body 格式：JSON 数组 [{doc_id, namespace, doc_title, slug, url, weight, ...}]
 */
export function parseIndexDoc(body) {
    if (!body)
        return { entries: [], parse_error: "空 body" };
    try {
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed)) {
            return { entries: [], parse_error: "body 不是 JSON 数组" };
        }
        const entries = parsed.map((e) => ({
            doc_id: e.doc_id || 0,
            namespace: e.namespace || "",
            doc_title: e.doc_title || "",
            slug: e.slug || "",
            url: e.url || (e.namespace && e.slug ? `https://www.yuque.com/${e.namespace}/${e.slug}` : ""),
            weight: e.weight ?? 5,
            title: e.title,
            keywords: e.keywords,
            search_surface: e.search_surface,
            summary: e.summary,
            tree: e.tree,
        }));
        return { entries };
    }
    catch (e) {
        return { entries: [], parse_error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
}
//# sourceMappingURL=index.js.map