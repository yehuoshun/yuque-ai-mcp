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
        if (graphResult && graphResult.entries.length > 0) {
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
    // 降级：搜索 API 无结果 → 逐页拉取全量 + 客户端标题匹配
    if (seenDocs.size === 0) {
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
                if (!item.namespace)
                    continue;
                const parts = item.namespace.split("/");
                const key = `${parts.slice(0, 2).join("/")}/${item.namespace}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allRoutes.push({
                        doc_id: 0,
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
    const deduped = dedupByDocIdNs(routeEntries);
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
// ═══════════════════════════════════════════════════════
// 图谱扩展
// ═══════════════════════════════════════════════════════
/**
 * 通过 _graph 文档做 1 跳邻居扩展
 *
 * 1. 搜 _graph 路由文档 → 读 body → 解析 GraphDoc
 * 2. 在 communities 中找命中关键词所属社区
 * 3. 取同社区内其他关键词（排除已命中），按社区 cohesion 排序
 * 4. 对邻居关键词搜路由 → 读索引文档 → 展开 entries
 */
async function expandWithGraph(hitKeywords, routeBooks, existingRoutes) {
    try {
        // 1. 找 _graph 路由文档
        const graphRoutes = await findRouteDocs(["_graph"], routeBooks, []);
        if (graphRoutes.length === 0)
            return null;
        // 2. 读 _graph 文档 body
        const { entries: graphEntries } = await readIndexDocsFromRoutes(graphRoutes);
        if (graphEntries.length === 0)
            return null;
        // _graph 的 body 存在第一个 entry 的 summary 里？不对，_graph 是特殊格式
        // 需要直接读 _graph 索引文档的 body
        const graphRoute = graphRoutes[0];
        const parts = graphRoute.book_namespace.split("/");
        if (parts.length < 3)
            return null;
        const repoNs = parts.slice(0, 2).join("/");
        const docSlug = parts.slice(2).join("/");
        const data = await get(`/repos/${repoNs}/docs/${docSlug}`);
        const body = (data.data || data).body || "";
        let graphDoc;
        try {
            graphDoc = JSON.parse(body);
        }
        catch {
            return null;
        }
        const communities = graphDoc.communities;
        if (!communities || communities.length === 0)
            return null;
        // 3. 找命中关键词所属社区，收集邻居关键词
        const hitSet = new Set(hitKeywords.map(k => k.toLowerCase()));
        const neighborCandidates = [];
        for (const comm of communities) {
            const commKeywords = comm.keywords || [];
            const hasHit = commKeywords.some(k => hitSet.has(k.toLowerCase()));
            if (!hasHit)
                continue;
            for (const kw of commKeywords) {
                if (!hitSet.has(kw.toLowerCase())) {
                    neighborCandidates.push({ keyword: kw, cohesion: comm.cohesion || 0.5 });
                }
            }
        }
        if (neighborCandidates.length === 0)
            return null;
        // 按 cohesion 排序，取 Top 5
        const topNeighbors = neighborCandidates
            .sort((a, b) => b.cohesion - a.cohesion)
            .slice(0, 5)
            .map(n => n.keyword);
        // 4. 搜邻居关键词的路由文档
        const neighborRoutes = await findRouteDocs(topNeighbors, routeBooks, []);
        if (neighborRoutes.length === 0)
            return null;
        // 去重：排除已搜过的路由
        const existingSet = new Set(existingRoutes.map(r => r.book_namespace));
        const newRoutes = neighborRoutes.filter(r => !existingSet.has(r.book_namespace));
        if (newRoutes.length === 0)
            return null;
        const { entries: neighborEntries } = await readIndexDocsFromRoutes(newRoutes);
        return { entries: neighborEntries, neighbors: topNeighbors };
    }
    catch {
        return null;
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