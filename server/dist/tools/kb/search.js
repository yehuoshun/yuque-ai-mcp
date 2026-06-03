import { get } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken } from "./utils.js";
import { parseIndexDoc } from "./index.js";
/**
 * 知识库搜索 — 双层路由 + 图谱扩展 + 降级
 *
 * 1. 搜索总库 → 找关键词路由文档 → 解析文档级 namespace
 * 2. 按 namespace 直接读索引文档 → 展开 entries
 * 3. 命中 < 3 篇 → 图谱扩展（1 跳邻居补搜）
 * 4. 路由 0 命中 → 自动降级语雀全库搜索
 * 5. 返回结构化 JSON（KbSearchResult）
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
        return JSON.stringify({
            tokens,
            route_hits: 0,
            source_entries: [],
            graph_expanded: false,
            graph_neighbors: [],
            fallback_used: "none",
            dirty_blocks: 0,
            errors: [{ token: "config", reason: "索引总库未配置" }],
            hint: "请配置 route_book（索引总库）或传 route_ns + route_id 参数",
        }, null, 2);
    }
    if (route_book_sub.length === 0) {
        return JSON.stringify({
            tokens,
            route_hits: 0,
            source_entries: [],
            graph_expanded: false,
            graph_neighbors: [],
            fallback_used: "none",
            dirty_blocks: 0,
            errors: [{ token: "config", reason: "子索引库未配置" }],
            hint: "请配置 route_book_sub（子索引库）",
        }, null, 2);
    }
    // ── Step 1: 路由定位 ──
    const routeEntries = await findRouteDocs(tokens, routeBooks, routeErrors);
    // ── Step 1.5: 路由 0 命中 → 自动降级全库搜索 ──
    if (routeEntries.length === 0) {
        const fallbackEntries = await globalSearchFallback(tokens);
        return JSON.stringify({
            tokens,
            route_hits: 0,
            source_entries: fallbackEntries,
            graph_expanded: false,
            graph_neighbors: [],
            fallback_used: fallbackEntries.length > 0 ? "global_search" : "none",
            dirty_blocks: 0,
            errors: routeErrors,
            hint: fallbackEntries.length === 0
                ? "索引和全库搜索均无结果，请尝试换搜索词或确认索引已构建"
                : undefined,
        }, null, 2);
    }
    // ── Step 2: 读索引文档 → 展开源文档指针 ──
    const { entries: rawEntries, hitKeywords, dirtyBlocks, errors } = await readIndexDocsFromRoutes(routeEntries);
    // 合并去重（按 doc_id，保留最高 weight）
    const allEntries = new Map();
    for (const e of rawEntries) {
        const existing = allEntries.get(e.doc_id);
        if (!existing || (e.weight ?? 0) > (existing.weight ?? 0)) {
            allEntries.set(e.doc_id, e);
        }
    }
    // ── Step 3: 图谱扩展（命中 < 3 篇时触发）──
    let graphExpanded = false;
    let graphNeighbors = [];
    if (allEntries.size < 3 && hitKeywords.length > 0) {
        const graphResult = await expandWithGraph(hitKeywords, routeBooks, routeEntries);
        if (graphResult.error) {
            errors.push({ token: "graph", reason: graphResult.error });
        }
        if (graphResult.entries.length > 0) {
            for (const e of graphResult.entries) {
                const existing = allEntries.get(e.doc_id);
                if (!existing || (e.weight ?? 0) > (existing.weight ?? 0)) {
                    allEntries.set(e.doc_id, e);
                }
            }
            graphExpanded = true;
            graphNeighbors = graphResult.neighbors;
        }
    }
    // 按 weight 降序
    const sorted = [...allEntries.values()].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    return JSON.stringify({
        tokens,
        route_hits: routeEntries.length,
        source_entries: sorted,
        graph_expanded: graphExpanded,
        graph_neighbors: graphNeighbors,
        fallback_used: "none",
        dirty_blocks: dirtyBlocks,
        errors,
    }, null, 2);
}
// ═══════════════════════════════════════════════════════
// 路由定位
// ═══════════════════════════════════════════════════════
/** 搜索总库 → 解析路由文档 body → 返回索引文档指针（文档级 namespace） */
async function findRouteDocs(tokens, routeBooks, errors) {
    const seenDocs = new Map();
    // 主路径：语雀搜索 API + 客户端标题过滤
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
    if (seenDocs.size === 0)
        return [];
    // 并发读路由文档 body → 解析路由指针
    const allRoutes = [];
    const seenKeys = new Set();
    await Promise.all(Array.from(seenDocs.entries()).map(async ([docId, doc]) => {
        try {
            const data = await get(`/repos/${doc.book_id}/docs/${docId}`);
            const body = (data.data || data).body || "";
            let list = [];
            let parseError = null;
            try {
                const parsed = JSON.parse(body);
                if (!Array.isArray(parsed)) {
                    parseError = `body 不是 JSON 数组（实际类型: ${typeof parsed}）`;
                }
                else {
                    list = parsed;
                }
            }
            catch (e) {
                parseError = `body JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`;
            }
            if (parseError) {
                errors.push({ token: `路由 doc_${docId}`, reason: parseError });
                return;
            }
            if (list.length === 0) {
                errors.push({ token: `路由 doc_${docId}`, reason: `路由条目为空数组（无子索引库指针）` });
                return;
            }
            for (const item of list) {
                if (!item.namespace) {
                    errors.push({ token: `路由 doc_${docId}`, reason: `条目缺少 namespace 字段（book_id=${item.book_id || '无'}）` });
                    continue;
                }
                const parts = item.namespace.split("/");
                const key = `${parts.slice(0, 2).join("/")}/${item.namespace}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allRoutes.push({
                        book_namespace: item.namespace,
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
// ═══════════════════════════════════════════════════════
// 读索引文档
// ═══════════════════════════════════════════════════════
/** 按文档级 namespace 直接读索引文档，展开源文档指针 */
async function readIndexDocsFromRoutes(routeEntries) {
    const errors = [];
    const allEntries = [];
    const hitKeywords = [];
    let dirtyBlocks = 0;
    const config = loadConfig();
    const CONCURRENCY = config.search_concurrency || 5;
    const deduped = dedupByNs(routeEntries);
    for (let i = 0; i < deduped.length; i += CONCURRENCY) {
        const chunk = deduped.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(async (re) => {
            try {
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
            if (indexKeyword)
                hitKeywords.push(indexKeyword);
            for (const entry of parsed.entries) {
                allEntries.push({
                    doc_id: entry.doc_id,
                    namespace: entry.namespace,
                    title: entry.title || entry.doc_title,
                    url: entry.url || `https://www.yuque.com/${entry.namespace}/${entry.slug}`,
                    keywords: entry.keywords,
                    search_surface: entry.search_surface,
                    summary: indexKeyword ? `[${indexKeyword}] ${entry.summary || entry.doc_title}` : (entry.summary || entry.doc_title),
                    sub_index_ns: doc.book_namespace,
                    weight: entry.weight,
                    tree: entry.tree, // 透传章节树给 Agent 做树搜索
                });
            }
        }
    }
    return { entries: allEntries, hitKeywords, dirtyBlocks, errors };
}
function dedupByNs(entries) {
    const seen = new Set();
    const result = [];
    for (const e of entries) {
        if (!seen.has(e.book_namespace)) {
            seen.add(e.book_namespace);
            result.push(e);
        }
    }
    return result;
}
// ═══════════════════════════════════════════════════════
// 图谱扩展
// ═══════════════════════════════════════════════════════
/**
 * 通过 graph_book 分片文档做 1 跳邻居扩展
 *
 * 1. listAllDocs(graph_book) → 全量文档即分片
 * 2. 并发读所有分片 → 合并 neighbors
 * 3. 查命中关键词的邻居 → Top 5
 * 4. 对邻居关键词搜路由 → 读索引文档 → 展开 entries
 */
async function expandWithGraph(hitKeywords, routeBooks, existingRoutes) {
    const config = loadConfig();
    const graphBook = config.graph_book;
    if (!graphBook || !graphBook.book_id)
        return { entries: [], neighbors: [] };
    try {
        // 1. 列出 graph_book 全部文档（专用库，返回即分片）
        const allDocs = await listAllDocs(graphBook.book_id);
        if (allDocs.length === 0)
            return { entries: [], neighbors: [] };
        // 2. 并发读所有分片
        const shardResults = await Promise.all(allDocs.map(async (doc) => {
            try {
                const data = await get(`/repos/${graphBook.book_id}/docs/${doc.id}`);
                const body = (data.data || data).body || "";
                const shard = JSON.parse(body);
                return shard.neighbors || {};
            }
            catch {
                return null;
            }
        }));
        // 合并所有分片的 neighbors
        const allNeighbors = {};
        for (const neighbors of shardResults) {
            if (neighbors)
                Object.assign(allNeighbors, neighbors);
        }
        if (Object.keys(allNeighbors).length === 0)
            return { entries: [], neighbors: [] };
        // 3. 查命中关键词的邻居，取 Top 5
        const hitSet = new Set(hitKeywords.map(k => k.toLowerCase()));
        const neighborSet = new Set();
        for (const hitKw of hitKeywords) {
            const neighbors = allNeighbors[hitKw]
                || Object.entries(allNeighbors).find(([k]) => k.toLowerCase() === hitKw.toLowerCase())?.[1];
            if (neighbors) {
                for (const n of neighbors) {
                    if (!hitSet.has(n.toLowerCase())) {
                        neighborSet.add(n);
                    }
                }
            }
        }
        if (neighborSet.size === 0)
            return { entries: [], neighbors: [] };
        const topNeighbors = [...neighborSet].slice(0, 5);
        // 4. 搜邻居关键词的路由文档
        const neighborRoutes = await findRouteDocs(topNeighbors, routeBooks, []);
        if (neighborRoutes.length === 0)
            return { entries: [], neighbors: [] };
        const existingSet = new Set(existingRoutes.map(r => r.book_namespace));
        const newRoutes = neighborRoutes.filter(r => !existingSet.has(r.book_namespace));
        if (newRoutes.length === 0)
            return { entries: [], neighbors: [] };
        const { entries: neighborEntries } = await readIndexDocsFromRoutes(newRoutes);
        return { entries: neighborEntries, neighbors: topNeighbors };
    }
    catch (err) {
        return { entries: [], neighbors: [], error: `图谱扩展异常: ${err.message || err}` };
    }
}
// ═══════════════════════════════════════════════════════
// 降级：全库搜索
// ═══════════════════════════════════════════════════════
/** 路由 0 命中时自动降级，直接调语雀搜索 API 搜全库 */
async function globalSearchFallback(tokens) {
    const allEntries = [];
    for (const token of tokens) {
        try {
            const data = await get(`/search?q=${encodeURIComponent(token)}&type=doc`);
            const results = data.data || [];
            for (const r of results) {
                const info = r.target || r;
                const id = info.id || r.id;
                if (!id)
                    continue;
                allEntries.push({
                    doc_id: id,
                    namespace: info.book?.namespace || "",
                    title: info.title || r.title || "",
                    url: info.slug && info.book?.namespace
                        ? `https://www.yuque.com/${info.book.namespace}/${info.slug}`
                        : "",
                    summary: (info.description || r.description || "").slice(0, 200),
                    weight: 5,
                    tree: undefined, // 降级路径无章节树，Agent 层直接读全文
                });
            }
        }
        catch { /* 单个 token 失败不阻塞 */ }
    }
    // 按 doc_id 去重
    const seen = new Set();
    return allEntries.filter(e => {
        if (seen.has(e.doc_id))
            return false;
        seen.add(e.doc_id);
        return true;
    });
}
// ═══════════════════════════════════════════════════════
// 分页拉取全量文档
// ═══════════════════════════════════════════════════════
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