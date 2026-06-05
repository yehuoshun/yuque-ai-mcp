import { get } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken } from "./utils.js";
import { parseIndexDoc } from "./index.js";
/**
 * 知识库搜索 — 索引库直搜 + 图谱扩展 + 降级
 *
 * 1. 搜所有索引库 → 找匹配的索引文档
 * 2. 读索引文档 body → 展开 entries
 * 3. 命中 < 3 篇 → 图谱扩展（1 跳邻居补搜）
 * 4. 索引库 0 命中 → 自动降级语雀全库搜索
 * 5. 返回结构化 JSON（KbSearchResult）
 */
export async function kbSearch(params) {
    const { route_book_sub } = loadConfig();
    const tokens = params.tokens.map(cleanToken);
    const errors = [];
    if (route_book_sub.length === 0) {
        return JSON.stringify({
            tokens,
            index_hits: 0,
            source_entries: [],
            total_entries: 0,
            truncated: false,
            graph_expanded: false,
            graph_neighbors: [],
            fallback_used: "none",
            dirty_blocks: 0,
            errors: [{ token: "config", reason: "索引库未配置" }],
            hint: "请配置 route_book_sub（索引库）",
        }, null, 2);
    }
    // ── Step 1: 搜索引库 → 找匹配的索引文档 ──
    const { indexDocs, hitKeywords } = await searchIndexBooks(tokens, route_book_sub, errors);
    // ── Step 1.5: 0 命中 → 自动降级全库搜索 ──
    if (indexDocs.length === 0) {
        const fallbackEntries = await globalSearchFallback(tokens);
        const maxEntries = params.max_entries ?? 20;
        const fbTotal = fallbackEntries.length;
        const fbTruncated = fbTotal > maxEntries;
        const fbEntries = fbTruncated ? fallbackEntries.slice(0, maxEntries) : fallbackEntries;
        return JSON.stringify({
            tokens,
            index_hits: 0,
            source_entries: fbEntries,
            total_entries: fbTotal,
            truncated: fbTruncated,
            graph_expanded: false,
            graph_neighbors: [],
            fallback_used: fallbackEntries.length > 0 ? "global_search" : "none",
            dirty_blocks: 0,
            errors,
            hint: fallbackEntries.length === 0
                ? "索引和全库搜索均无结果，请尝试换搜索词或确认索引已构建"
                : undefined,
        }, null, 2);
    }
    // ── Step 2: 读索引文档 body → 展开源文档指针 ──
    const { entries: rawEntries, dirtyBlocks, errors: readErrors } = await readIndexDocs(indexDocs);
    errors.push(...readErrors);
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
        const graphResult = await expandWithGraph(hitKeywords, route_book_sub);
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
    // 按 weight 降序 → 截断
    const maxEntries = params.max_entries ?? 20;
    const sorted = [...allEntries.values()].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
    const totalEntries = sorted.length;
    const truncated = totalEntries > maxEntries;
    const sourceEntries = truncated ? sorted.slice(0, maxEntries) : sorted;
    return JSON.stringify({
        tokens,
        index_hits: indexDocs.length,
        source_entries: sourceEntries,
        total_entries: totalEntries,
        truncated,
        graph_expanded: graphExpanded,
        graph_neighbors: graphNeighbors,
        fallback_used: "none",
        dirty_blocks: dirtyBlocks,
        errors,
    }, null, 2);
}
/** 搜所有索引库 → 找匹配的索引文档 */
async function searchIndexBooks(tokens, subBooks, errors) {
    const seenDocs = new Map();
    await Promise.all(subBooks.map(async (sb) => {
        await Promise.all(tokens.map(async (token) => {
            try {
                const data = await get(`/search?q=${encodeURIComponent(token)}&type=doc&scope=${sb.namespace}`);
                for (const r of (data.data || [])) {
                    const info = r.target || r;
                    const id = info.id || r.id;
                    const title = (info.title || r.title || "").trim();
                    if (id && !seenDocs.has(id)) {
                        seenDocs.set(id, { book_id: sb.book_id, doc_id: id, title });
                    }
                }
            }
            catch (err) {
                errors.push({ token, reason: `索引库 ${sb.namespace} 搜索失败: ${err.message || err}` });
            }
        }));
    }));
    const indexDocs = Array.from(seenDocs.values());
    const hitKeywords = indexDocs.map(d => d.title);
    return { indexDocs, hitKeywords };
}
// ═══════════════════════════════════════════════════════
// 读索引文档
// ═══════════════════════════════════════════════════════
/** 并发读索引文档 body，展开源文档指针 */
async function readIndexDocs(indexDocs) {
    const errors = [];
    const allEntries = [];
    let dirtyBlocks = 0;
    const config = loadConfig();
    const CONCURRENCY = config.search_concurrency || 5;
    for (let i = 0; i < indexDocs.length; i += CONCURRENCY) {
        const chunk = indexDocs.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(async (doc) => {
            try {
                const data = await get(`/repos/${doc.book_id}/docs/${doc.doc_id}`);
                return {
                    book_id: doc.book_id,
                    doc_id: doc.doc_id,
                    title: (data.data || data).title || "",
                    body: (data.data || data).body || "",
                };
            }
            catch (err) {
                errors.push({ token: 'body_read', reason: `book_id=${doc.book_id} doc_id=${doc.doc_id}: ${err.message || String(err)}` });
                return { book_id: doc.book_id, doc_id: doc.doc_id, title: "", body: "" };
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
            for (const entry of parsed.entries) {
                allEntries.push({
                    doc_id: entry.doc_id,
                    namespace: entry.namespace,
                    title: entry.doc_title,
                    url: entry.url || `https://www.yuque.com/${entry.namespace}/${entry.slug}`,
                    keywords: entry.keywords,
                    search_surface: entry.search_surface,
                    summary: entry.summary,
                    sub_index_ns: `${doc.book_id}/${doc.doc_id}`,
                    weight: entry.weight,
                    tree: entry.tree,
                });
            }
        }
    }
    return { entries: allEntries, dirtyBlocks, errors };
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
 * 4. 对邻居关键词搜索引库 → 读索引文档 → 展开 entries
 */
async function expandWithGraph(hitKeywords, subBooks) {
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
        // 4. 搜邻居关键词的索引库
        const { indexDocs } = await searchIndexBooks(topNeighbors, subBooks, []);
        if (indexDocs.length === 0)
            return { entries: [], neighbors: [] };
        const { entries: neighborEntries } = await readIndexDocs(indexDocs);
        return { entries: neighborEntries, neighbors: topNeighbors };
    }
    catch (err) {
        return { entries: [], neighbors: [], error: `图谱扩展异常: ${err.message || err}` };
    }
}
// ═══════════════════════════════════════════════════════
// 降级：全库搜索
// ═══════════════════════════════════════════════════════
/** 索引库 0 命中时自动降级，直接调语雀搜索 API 搜全库 */
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
                const title = (info.title || r.title || "").trim();
                allEntries.push({
                    doc_id: id,
                    namespace: info.book?.namespace || "",
                    title,
                    url: info.slug && info.book?.namespace
                        ? `https://www.yuque.com/${info.book.namespace}/${info.slug}`
                        : "",
                    summary: r.summary || "",
                    search_surface: r.summary || "",
                    keywords: title ? extractKeywords(title) : undefined,
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
/** 从标题提取关键词（降级搜索用，拆分隔符取 2-20 字片段） */
function extractKeywords(title) {
    const tokens = title
        .split(/[\s,，、|｜丨\/\\·\-—–]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2 && t.length <= 20);
    return [...new Set(tokens)].slice(0, 5);
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