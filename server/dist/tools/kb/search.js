import { get } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken } from "./utils.js";
import { parseIndexDoc } from "./index.js";
/**
 * 知识库搜索 — 双层路由：总库关键词路由 → 子库关键词索引
 *
 * 1. tokens in:title 搜总库 → 找到关键词路由文档
 * 2. 路由文档 body 为 source_books 数组 [{book_id, namespace, last_built?}]
 * 3. tokens in:title 搜子库 → 找到关键词索引文档
 * 4. 读取索引文档 → parseIndexDoc 展开 → 返回源文档指针
 */
export async function kbSearch(params) {
    const { route_book, route_book_sub } = loadConfig();
    const tokens = params.tokens.map(cleanToken);
    const routeErrors = [];
    let routeBooks;
    if (params.route_ns && params.route_id) {
        routeBooks = [{ book_id: params.route_id, namespace: params.route_ns }];
    }
    else if (route_book.length > 0) {
        routeBooks = route_book;
    }
    else {
        return [
            "⚠️ 索引总库未配置。",
            "",
            "索引搜索需要 route_book（索引总库）做路由层。请执行：",
            "1. yuque_create_repo → 创建总库（如 route-book）",
            "2. yuque_config_update → 追加 route_book",
            "",
            "或通知 Agent 代为创建。",
            "",
            "降级方案：传 route_ns + route_id 参数直接指定总库。",
        ].join("\n");
    }
    if (route_book_sub.length === 0) {
        return [
            "⚠️ 子索引库未配置。",
            "",
            "索引搜索需要 route_book_sub（子索引库）存关键词索引文档。请执行：",
            "1. yuque_create_repo → 创建子索引库",
            "2. yuque_config_update → 追加 route_book_sub",
            "",
            "或通知 Agent 代为创建。",
        ].join("\n");
    }
    // Step 1: 搜索总库 → 找关键词路由文档 → 解析出文档级 namespace
    const routeEntries = await findRouteDocs(tokens, routeBooks, routeErrors);
    if (routeEntries.length === 0) {
        const lines = [
            `🔍 搜索 token：${tokens.join(", ")}`,
            ...routeErrors.map(e => `- ${e.token}: ${e.reason}`),
            '',
            `未找到匹配的索引域。请尝试降级使用 yuque_search 全局搜索。`,
        ];
        if (routeErrors.length > 0)
            lines.splice(1, 0, `⚠️ 路由错误：`);
        return lines.join("\n");
    }
    // Step 2: 路由文档的 namespace 是文档级路径（group/slug/slug），直接读索引文档
    const { entries, dirtyBlocks, errors } = await readIndexDocsFromRoutes(routeEntries);
    return formatSearchResults(tokens, routeEntries, entries, dirtyBlocks, routeErrors, errors);
}
// ─── 路由定位 ──────────────────────────────────────────
/** 搜索总库 → 解析路由文档 body → 返回索引文档指针（文档级 namespace） */
async function findRouteDocs(tokens, routeBooks, errors) {
    const seenDocs = new Map();
    // N 路并行搜总库 — 语雀 v2 API 不支持 in:title，客户端过滤
    await Promise.all(routeBooks.map(async (rb) => {
        await Promise.all(tokens.map(async (token) => {
            try {
                const data = await get(`/search?q=${encodeURIComponent(token)}&type=doc&scope=${rb.namespace}`);
                for (const r of (data.data || [])) {
                    const info = r.target || r;
                    const id = info.id || r.id;
                    const title = (info.title || r.title || "").trim();
                    if (id && title.toLowerCase().includes(token.toLowerCase()) && !seenDocs.has(id)) {
                        seenDocs.set(id, { title, book_id: rb.book_id });
                    }
                }
            }
            catch (err) {
                errors.push({ token, reason: `路由搜索失败: ${err.message || err}` });
            }
        }));
    }));
    if (seenDocs.size === 0) {
        // 降级：搜索 API 无结果时，逐页拉取全部文档 + 客户端标题匹配
        await Promise.all(routeBooks.map(async (rb) => {
            try {
                const allDocs = await listAllDocs(rb.book_id);
                for (const doc of allDocs) {
                    const title = (doc.title || "").trim();
                    if (title && tokens.some(t => title.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(title.toLowerCase()))) {
                        seenDocs.set(doc.id, { title, book_id: rb.book_id });
                    }
                }
            }
            catch { /* 降级失败也不报错 */ }
        }));
    }
    if (seenDocs.size === 0)
        return [];
    // 并发读总库文档 body → 解析路由指针
    const allRoutes = [];
    const seenKeys = new Set();
    await Promise.all(Array.from(seenDocs.entries()).map(async ([docId, doc]) => {
        try {
            const data = await get(`/repos/${doc.book_id}/docs/${docId}`);
            const body = (data.data || data).body || "";
            // 路由文档 body — 格式：[{book_id, namespace}]，namespace 是文档级路径
            let list = [];
            try {
                const parsed = JSON.parse(body);
                list = Array.isArray(parsed) ? parsed : [];
            }
            catch {
                // body 不是合法 JSON
            }
            if (list.length === 0) {
                errors.push({ token: `路由 doc_${docId}`, reason: `无法解析路由条目` });
                return;
            }
            for (const item of list) {
                if (!item.namespace)
                    continue;
                // namespace 是文档级路径（group/slug/slug），直接用作 book_namespace
                // 从 namespace 提取 book_id（取前两段 group/slug）
                const parts = item.namespace.split("/");
                const bookNs = parts.length >= 2 ? parts.slice(0, 2).join("/") : item.namespace;
                const key = `${bookNs}/${item.namespace}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allRoutes.push({
                        doc_id: 0, // 不用 doc_id，直接用 namespace 读
                        book_namespace: item.namespace, // 文档级 namespace
                    });
                }
            }
        }
        catch (err) {
            errors.push({ token: `路由 doc_${docId}`, reason: `解析失败: ${err.message || err}` });
        }
    }));
    return allRoutes;
}
// ─── 直接读索引文档（文档级 namespace） ────────────────
/** 按文档级 namespace 直接读索引文档，展开源文档指针 */
async function readIndexDocsFromRoutes(routeEntries) {
    const errors = [];
    const allEntries = new Map();
    let dirtyBlocks = 0;
    const config = loadConfig();
    const CONCURRENCY = config.search_concurrency || 5;
    const deduped = dedupByDocIdNs(routeEntries);
    // 分批并发读索引文档（book_namespace 是文档级路径 group/slug/slug，
    // 拆成 repo_ns + doc_slug 后调 GET /repos/{repo_ns}/docs/{slug}）
    for (let i = 0; i < deduped.length; i += CONCURRENCY) {
        const chunk = deduped.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(async (re) => {
            try {
                // 文档级 namespace 如 yehuoshun/idx-java-1/springboot
                // → repo_ns=yehuoshun/idx-java-1, doc_slug=springboot
                const parts = re.book_namespace.split("/");
                if (parts.length < 3) {
                    errors.push({ token: 'body_read', reason: `namespace=${re.book_namespace}: 不是文档级路径（需要三段 group/slug/slug）` });
                    return { book_namespace: re.book_namespace, title: "", body: "" };
                }
                const repoNs = parts.slice(0, 2).join("/");
                const docSlug = parts.slice(2).join("/");
                const data = await get(`/repos/${repoNs}/docs/${docSlug}`);
                return {
                    book_namespace: re.book_namespace,
                    title: (data.data || data).title || "",
                    body: (data.data || data).body || "",
                };
            }
            catch (err) {
                errors.push({ token: 'body_read', reason: `namespace=${re.book_namespace}: ${err.message || String(err)}` });
                return { book_namespace: re.book_namespace, title: "", body: "" };
            }
        }));
        for (const doc of results) {
            if (!doc.body)
                continue;
            const parsed = parseIndexDoc(doc.body);
            if (parsed.parse_error) {
                dirtyBlocks++;
                continue;
            }
            const indexKeyword = doc.title?.trim();
            for (const entry of parsed.entries) {
                const existing = allEntries.get(entry.doc_id);
                if (!existing || (entry.weight ?? 0) > (existing.weight ?? 0)) {
                    allEntries.set(entry.doc_id, {
                        doc_id: entry.doc_id,
                        namespace: entry.namespace,
                        title: entry.title || entry.doc_title,
                        url: entry.url || `https://www.yuque.com/${entry.namespace}/${entry.slug}`,
                        keywords: entry.keywords,
                        search_surface: entry.search_surface,
                        summary: indexKeyword ? `[${indexKeyword}] ${entry.summary || entry.doc_title}` : (entry.summary || entry.doc_title),
                        sub_index_ns: doc.book_namespace,
                        weight: entry.weight,
                    });
                }
            }
        }
    }
    return { entries: Array.from(allEntries.values()), dirtyBlocks, errors };
}
function dedupByDocIdNs(entries) {
    const seen = new Set();
    const result = [];
    for (const e of entries) {
        const key = `${e.book_namespace}/${e.doc_id}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(e);
        }
    }
    return result;
}
// ─── 格式化输出 ────────────────────────────────────────
function formatSearchResults(tokens, routeEntries, entries, dirtyBlocks, routeErrors, readErrors) {
    const errors = [...routeErrors, ...readErrors];
    const hitNS = [...new Set(entries.map(e => e.sub_index_ns).filter(Boolean))];
    const lines = [
        `🔍 搜索 token：${tokens.join(", ")}`,
        `路由命中 ${routeEntries.length} 个索引文档${hitNS.length ? `，分布子库：${hitNS.join(", ")}` : ""}`,
        `展开 ${entries.length} 篇源文档${dirtyBlocks ? `，${dirtyBlocks} 个脏块` : ""}`,
    ];
    if (errors.length > 0) {
        lines.push('', '⚠️ 错误：', ...errors.map(e => `- ${e.token}: ${e.reason}`), '');
    }
    // 按权重降序
    const sorted = [...entries].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    for (const e of sorted) {
        lines.push(`---`, `**${e.title || "(无标题)"}** (doc_id=${e.doc_id}, namespace=${e.namespace})` + (e.sub_index_ns ? ` [${e.sub_index_ns}]` : "") + (e.weight ? ` ⭐${e.weight}` : ""), ...(e.url ? [e.url] : []), ...(e.summary ? [`摘要：${e.summary}`] : []), ...(e.keywords?.length ? [`关键词：${e.keywords.join(", ")}`] : []), '');
    }
    return lines.join("\n");
}
// ─── 分页拉取全部文档 ──────────────────────────────────
/** 逐页拉取知识库全部文档（语雀 API limit ≤ 100） */
export async function listAllDocs(bookId) {
    const all = [];
    let offset = 0;
    const limit = 100;
    while (true) {
        const data = await get(`/repos/${bookId}/docs?offset=${offset}&limit=${limit}`);
        const docs = (data.data || data);
        if (!Array.isArray(docs) || docs.length === 0)
            break;
        all.push(...docs);
        if (docs.length < limit)
            break;
        offset += limit;
    }
    return all;
}
//# sourceMappingURL=search.js.map