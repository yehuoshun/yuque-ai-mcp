import { get, post, put } from "../client.js";
import { loadConfig } from "../config.js";
// ─── 搜索 ──────────────────────────────────────────────
/**
 * 知识库搜索 — 管道全自动（双层：路由 + 子索引库）
 *
 * 输入：搜索 token 数组 + 索引总库信息
 * 输出：Markdown 文本（title/url/summary/keywords + 脏块标记）
 *
 * 流程：
 *   tokens → 搜总库 [路由] 文档 → 解析子索引库指针
 *   → 每个子索引库 fork 一条搜索管线（并行）
 *   → 合并所有结果 + did 去重 → Markdown
 */
export async function kbSearch(params) {
    const { route_book } = loadConfig();
    const { tokens } = params;
    const routeErrors = [];
    // 确定要搜哪些总库：用户显式传入 > 配置的全部 route_book
    let routeBooks;
    if (params.route_ns && params.route_id) {
        routeBooks = [{ book_id: params.route_id, namespace: params.route_ns }];
    }
    else if (route_book.length > 0) {
        routeBooks = route_book;
    }
    else {
        return `⚠️ 索引总库未配置。请在 config 中设置 route_book 数组，或传入 route_ns / route_id 参数。`;
    }
    // ROOT Step: 并行搜所有总库 → 收集路由
    const subIndexes = await findSubIndexesFromAll(tokens, routeBooks, routeErrors);
    if (subIndexes.length === 0) {
        const lines = [];
        lines.push(`🔍 搜索 token：${tokens.join(", ")}`);
        if (routeErrors.length > 0) {
            lines.push(`⚠️ 路由错误：`);
            for (const e of routeErrors) {
                lines.push(`- ${e.token}: ${e.reason}`);
            }
        }
        lines.push(`未找到匹配的索引域。请尝试降级使用 yuque_search 全局搜索。`);
        return lines.join("\n");
    }
    // Fork: 每个子索引库并行搜索
    const subResults = await Promise.all(subIndexes.map(si => searchOneSubIndex(tokens, si.namespace, si.book_id)));
    // Merge: 合并所有子索引库结果
    const allEntryMap = new Map();
    let totalOk = 0;
    let totalDirty = 0;
    let totalIndexDocsHit = 0;
    const allErrors = [...routeErrors];
    const hitSubIndexes = [];
    for (const sr of subResults) {
        if (sr.indexDocsHit > 0)
            hitSubIndexes.push(sr.ns);
        totalOk += sr.okBlocks;
        totalDirty += sr.dirtyBlocks;
        totalIndexDocsHit += sr.indexDocsHit;
        allErrors.push(...sr.errors);
        for (const e of sr.entries) {
            if (!allEntryMap.has(e.did)) {
                allEntryMap.set(e.did, e);
            }
        }
    }
    const allEntries = Array.from(allEntryMap.values());
    // 组装 Markdown 输出
    const lines = [];
    lines.push(`🔍 搜索 token：${tokens.join(", ")}`);
    lines.push(`路由命中 ${subIndexes.length} 个子索引库` + (hitSubIndexes.length > 0 ? `：${hitSubIndexes.join(", ")}` : ""));
    lines.push(`合并命中 ${totalIndexDocsHit} 篇索引文档，${totalOk} 个正常块` + (totalDirty > 0 ? `，${totalDirty} 个脏块` : ""));
    // 错误
    if (allErrors.length > 0) {
        lines.push(``, `⚠️ 错误：`);
        for (const e of allErrors) {
            lines.push(`- ${e.token}: ${e.reason}`);
        }
        lines.push("");
    }
    // 正常块
    for (const e of allEntries) {
        if (e.parse_error)
            continue;
        const title = e.title || "(无标题)";
        lines.push(`---`);
        lines.push(`**${title}** (did=${e.did}, ns=${e.ns})` + (e.sub_index_ns ? ` [${e.sub_index_ns}]` : ""));
        if (e.url)
            lines.push(e.url);
        if (e.summary)
            lines.push(`摘要：${e.summary}`);
        if (e.keywords)
            lines.push(`关键词：${e.keywords}`);
        lines.push("");
    }
    // 脏块
    for (const e of allEntries) {
        if (!e.parse_error)
            continue;
        lines.push(`---`);
        lines.push(`⚠️ 脏块 (did=${e.did}, ns=${e.ns}): ${e.parse_error}`);
    }
    return lines.join("\n");
}
// ─── 路由定位（多总库）──────────────────────────────────
/**
 * 搜索所有总库 → 找 [路由] 文档 → 解析子索引库指针，合并去重
 */
async function findSubIndexesFromAll(tokens, routeBooks, errors) {
    const allPointers = new Map(); // namespace → pointer
    await Promise.all(routeBooks.map(async (rb) => {
        const ptrs = await findSubIndexes(tokens, rb.namespace, rb.book_id, errors);
        for (const p of ptrs) {
            if (!allPointers.has(p.namespace)) {
                allPointers.set(p.namespace, p);
            }
        }
    }));
    return Array.from(allPointers.values());
}
/**
 * 搜索索引总库 → 找 [路由] 文档 → 解析子索引库指针
 */
async function findSubIndexes(tokens, route_ns, route_id, errors) {
    // Step A: N 路并行搜总库（[路由] 前缀过滤）
    const seenDocs = new Map();
    await Promise.all(tokens.map(async (token) => {
        const q = encodeURIComponent(token);
        const url = `/search?q=${q}&type=doc&scope=${route_ns}`;
        try {
            const data = await get(url);
            const hits = data.data || [];
            for (const r of hits) {
                const info = r.target || r;
                const id = info.id || r.id;
                const title = info.title || r.title || "";
                if (id && title.startsWith("[路由] ") && !seenDocs.has(id)) {
                    seenDocs.set(id, title);
                }
            }
        }
        catch (err) {
            errors.push({ token, reason: `路由搜索失败: ${err.message || err}` });
        }
    }));
    if (seenDocs.size === 0)
        return [];
    // Step B: 并发读路由文档 body → 解析 JSON
    const pointers = new Map(); // namespace → pointer
    await Promise.all(Array.from(seenDocs.keys()).map(async (docId) => {
        try {
            const data = await get(`/repos/${route_id}/docs/${docId}`);
            const d = data.data || data;
            const body = d.body || "";
            const parsed = JSON.parse(body);
            const list = Array.isArray(parsed) ? parsed : (parsed.e || []);
            for (const item of list) {
                const ns = item.namespace || item.ns;
                const bid = item.book_id || item.bid;
                if (ns && bid && !pointers.has(ns)) {
                    pointers.set(ns, { book_id: bid, namespace: ns });
                }
            }
        }
        catch (err) {
            errors.push({ token: `[路由] doc_${docId}`, reason: `解析失败: ${err.message || err}` });
        }
    }));
    return Array.from(pointers.values());
}
// ─── 单子库搜索管线 ─────────────────────────────────────
/**
 * 在单个子索引库中搜索，返回结构化的 SubIndexResult
 * 流程：并行翻页搜 → doc_id 去重 → 分批读 body → 解析 --- 分块
 */
async function searchOneSubIndex(tokens, scope, bookId) {
    const errors = [];
    const PAGE_SIZE = 20;
    const MAX_PAGES = 5;
    // Step 1: N 路并行翻页搜索
    const searchResults = await Promise.all(tokens.map(async (token) => {
        const allHits = [];
        let page = 1;
        let hasMore = true;
        const q = encodeURIComponent(token);
        while (hasMore && page <= MAX_PAGES) {
            try {
                const url = `/search?q=${q}&type=doc&scope=${scope}&page=${page}`;
                const data = await get(url);
                const hits = data.data || [];
                const meta = data.meta || {};
                for (const r of hits) {
                    allHits.push({
                        doc_id: r.id || r.doc_id,
                        title: r.title || "",
                    });
                }
                const total = meta.total || 0;
                hasMore = total > page * PAGE_SIZE;
                page++;
            }
            catch (err) {
                errors.push({ token, reason: err.message || String(err) });
                hasMore = false;
            }
        }
        return { token, hits: allHits };
    }));
    // Step 2: doc_id 去重
    const seen = new Map();
    for (const sr of searchResults) {
        for (const hit of sr.hits) {
            if (!seen.has(hit.doc_id)) {
                seen.set(hit.doc_id, hit);
            }
        }
    }
    const indexDocs = Array.from(seen.values());
    if (indexDocs.length === 0) {
        return { entries: [], okBlocks: 0, dirtyBlocks: 0, indexDocsHit: 0, errors, ns: scope };
    }
    // Step 3: 分批并发读 body（并发 5）
    const CONCURRENCY = 5;
    const bodies = [];
    const bodyReadErrors = [];
    for (let i = 0; i < indexDocs.length; i += CONCURRENCY) {
        const chunk = indexDocs.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(async (doc) => {
            try {
                const data = await get(`/repos/${bookId}/docs/${doc.doc_id}`);
                const d = data.data || data;
                return { doc_id: doc.doc_id, title: doc.title, body: d.body || "" };
            }
            catch (err) {
                bodyReadErrors.push({ doc_id: doc.doc_id, reason: err.message || String(err) });
                return { doc_id: doc.doc_id, title: doc.title, body: "" };
            }
        }));
        bodies.push(...results);
    }
    for (const be of bodyReadErrors) {
        errors.push({ token: `body_read`, reason: `doc_id=${be.doc_id}: ${be.reason}` });
    }
    // Step 4: 解析 body → 提块
    const entries = [];
    let okBlocks = 0;
    let dirtyBlocks = 0;
    for (const b of bodies) {
        const blocks = parseIndexBody(b.body);
        for (const block of blocks) {
            if (block.parse_error) {
                dirtyBlocks++;
                entries.push({
                    did: block.did,
                    ns: block.ns,
                    sub_index_ns: scope,
                    parse_error: block.parse_error,
                });
            }
            else {
                okBlocks++;
                const fallbackTitle = b.title?.replace(/^\[索引\]\s*/, "").trim() || undefined;
                entries.push({
                    did: block.did,
                    ns: block.ns,
                    keywords: block.keywords,
                    summary: block.summary,
                    title: block.title || fallbackTitle,
                    url: block.slug ? `https://www.yuque.com/${block.ns}/${block.slug}` : undefined,
                    sub_index_ns: scope,
                });
            }
        }
    }
    return { entries, okBlocks, dirtyBlocks, indexDocsHit: indexDocs.length, errors, ns: scope };
}
// ─── 索引构建 ──────────────────────────────────────────
/**
 * 字符清洗：只去空格（语雀 search token 之间 AND 匹配，空格拆词）
 */
export function cleanSearchText(text) {
    return text.replace(/\s+/g, "");
}
/**
 * 创建单篇文档索引（新格式 v2 — 文档中心）
 *
 * 一篇源文档 → 一篇索引文档，多主题用 `---` 分块：
 *
 *   关键词：SpringBoot 自动配置 EnableAutoConfiguration...
 *   摘要：SpringBoot 通过 @EnableAutoConfiguration...
 *   id=584 | namespace=yehuoshun/dil9w3
 *   ---
 *   关键词：条件装配 ConditionalOnClass...
 *   摘要：SpringBoot 条件装配...
 *   id=584 | namespace=yehuoshun/dil9w3
 */
export async function createIndexDoc(params) {
    const { blocks, source_title, index_book_id } = params;
    if (!blocks || blocks.length === 0) {
        throw new Error("blocks 不能为空");
    }
    // 组装 body：每个块 = 关键词 + 摘要 + 元数据，块之间用 --- 分隔
    const blockTexts = blocks.map((block) => {
        const cleanKeywords = cleanSearchText(block.keywords);
        const metaLines = [
            `id=${block.doc_id} | namespace=${block.namespace}`,
            block.title ? `title=${block.title}` : null,
            block.slug ? `slug=${block.slug}` : null,
        ].filter(Boolean);
        return [
            `关键词：${cleanKeywords}`,
            ``,
            `摘要：${block.summary}`,
            ``,
            ...metaLines,
        ].join("\n");
    });
    const body = blockTexts.join("\n\n---\n\n");
    // 标题清洗
    const cleanTitle = cleanSearchText(source_title) || source_title;
    const { route_sub, default_book } = loadConfig();
    const bookId = index_book_id || route_sub[0]?.book_id || default_book.book_id;
    if (!bookId)
        throw new Error("未指定 index_book_id 且未配置 route_sub 或 default_book");
    const payload = {
        title: `[索引] ${cleanTitle}`,
        body,
        format: "markdown",
    };
    const data = await post(`/repos/${bookId}/docs`, payload);
    const created = data.data || data;
    const docId = created.id;
    // 自动挂 TOC（必选，否则无法被搜索）
    await put(`/repos/${bookId}/toc`, {
        action: "appendNode",
        action_mode: "child",
        target_uuid: "",
        type: "DOC",
        doc_ids: [docId],
    });
    return JSON.stringify({
        created: true,
        doc_id: docId,
        source_title: source_title, // 原始标题（未清洗）
        source_title_clean: cleanTitle, // 清洗后的标题
        blocks: blocks.length,
        title: `[索引] ${cleanTitle}`,
    }, null, 2);
}
// ─── helpers ──────────────────────────────────────────
/**
 * 解析索引文档 body → 提取所有 `---` 分隔的块
 *
 * 每块格式：
 *   关键词：...
 *   摘要：...
 *   id=xxx | namespace=xxx
 *   title=xxx        （可选）
 *   slug=xxx         （可选）
 */
function parseIndexBody(body) {
    if (!body)
        return [];
    const parts = body.split(/\n---\n/);
    if (parts.length <= 1)
        return [];
    const blocks = [];
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const keywords = extractLine(trimmed, "关键词：");
        const summary = extractSection(trimmed, "摘要：", "id=");
        const did = extractNumber(trimmed, "id=");
        const ns = extractValue(trimmed, "namespace=");
        const title = extractLine(trimmed, "title=");
        const slug = extractLine(trimmed, "slug=");
        // 脏块检测：缺关键字段 → 不丢，带 parse_error 标记
        const missing = [];
        if (!keywords)
            missing.push("关键词");
        if (did === null)
            missing.push("id");
        if (!ns)
            missing.push("namespace");
        if (missing.length > 0) {
            blocks.push({ keywords: keywords || "", summary: summary || "", did: did || 0, ns: ns || "", parse_error: `缺少字段: ${missing.join("/")}` });
            continue;
        }
        blocks.push({ keywords: keywords, summary, did: did, ns: ns, title: title || undefined, slug: slug || undefined });
    }
    return blocks;
}
// ─── 文本提取小工具 ────────────────────────────────────
/** 提取行：`label文字...`  → 返回 label 后面的内容 */
function extractLine(text, label) {
    const regex = new RegExp(`${escapeRegex(label)}(.+)`, "m");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
}
/** 提取段落：`label1...` 到 `label2` 之间的内容 */
function extractSection(text, startLabel, endLabel) {
    const startIdx = text.indexOf(startLabel);
    if (startIdx === -1)
        return "";
    const after = text.slice(startIdx + startLabel.length);
    const endIdx = after.indexOf(endLabel);
    return (endIdx === -1 ? after : after.slice(0, endIdx)).trim();
}
/** 提取数字：`label=123` → 123 */
function extractNumber(text, label) {
    const regex = new RegExp(`${escapeRegex(label)}(\\d+)`, "m");
    const match = text.match(regex);
    return match ? parseInt(match[1], 10) : null;
}
/** 提取值：`label=xxx` → xxx（到换行或 |） */
function extractValue(text, label) {
    const regex = new RegExp(`${escapeRegex(label)}(.+?)(?:\\s*\\||$)`, "m");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//# sourceMappingURL=kb.js.map