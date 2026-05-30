import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";
// 容量上限（语雀单库文档上限约 5000，远远大于索引规模，此检查仅兜底）
const REPO_DOC_LIMIT = 5000;
// 语雀单篇文档 body 上限约 200KB，留 5KB 安全余量
const YUQUE_BODY_MAX = 195 * 1024;
/** 静默检查知识库容量，仅超限时警告（几乎不会触发） */
async function checkRepoCapacity(bookId, label) {
    try {
        const data = await get(`/repos/${bookId}`);
        const repo = data.data || data;
        const count = repo.items_count || 0;
        if (count >= REPO_DOC_LIMIT * 0.95) {
            return `⚠️ ${label}（${repo.name || bookId}）已有 ${count} 篇文档，接近语雀上限（${REPO_DOC_LIMIT}），请手动处理。`;
        }
    }
    catch { }
    return "";
}
/** 构建索引文档 body */
function buildIndexBody(keywords, summary, entries) {
    return [
        `关键词：${keywords}`,
        ``,
        `摘要：${summary}`,
        ``,
        `entries：${JSON.stringify(entries)}`,
    ].join("\n");
}
/** body 模板开销（不含 entries JSON），用于估算单篇可容纳的 entry 数 */
function buildBodyOverhead(keywords, summary) {
    return [
        `关键词：${keywords}`,
        ``,
        `摘要：${summary}`,
        ``,
        `entries：`,
    ].join("\n");
}
/** 将 entries 按 body 上限拆分为多批 */
function splitEntries(entries, keywords, summary) {
    const overhead = Buffer.byteLength(buildBodyOverhead(keywords, summary), "utf-8");
    const batches = [];
    let current = [];
    let currentSize = overhead;
    for (const entry of entries) {
        // 估算单个 entry 的大小（JSON 序列化 + 逗号分隔）
        const entryStr = (current.length > 0 ? "," : "") + JSON.stringify(entry);
        const entrySize = Buffer.byteLength(entryStr, "utf-8");
        if (currentSize + entrySize > YUQUE_BODY_MAX && current.length > 0) {
            // 当前批次满了，开新批次
            batches.push(current);
            current = [];
            currentSize = overhead;
        }
        current.push(entry);
        currentSize += entrySize;
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}
/**
 * 创建关键词索引文档（v3 — 关键词中心）
 *
 * 一个关键词 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * body 超过 195KB 时自动分片：关键词(1)、关键词(2) ...
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":10}]
 */
export async function createIndexDoc(params) {
    const { keyword, keywords, summary, entries, index_book_id } = params;
    if (!keyword)
        throw new Error("keyword 不能为空");
    if (!entries || entries.length === 0)
        throw new Error("entries 不能为空");
    const cleanKw = cleanToken(keyword);
    const cleanKeywords = cleanKeywordsArray(keywords);
    // 校验必填字段
    for (const e of entries) {
        if (!e.did)
            throw new Error("每个 entry 必须有 did");
        if (!e.ns)
            throw new Error("每个 entry 必须有 ns");
        if (!e.t)
            throw new Error("每个 entry 必须有 t（标题）");
        if (!e.s)
            throw new Error("每个 entry 必须有 s（slug）");
    }
    // 为每个 entry 补 url（https://www.yuque.com/{ns}/{s}）
    const enrichedEntries = entries.map(e => ({
        ...e,
        url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
    }));
    const { route_book_sub, default_book } = loadConfig();
    const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
    if (!bookId)
        throw new Error("未指定 index_book_id 且未配置 route_book_sub 或 default_book");
    // 容量检查
    const capacityWarn = await checkRepoCapacity(bookId, "子索引库");
    if (capacityWarn) {
        return JSON.stringify({ warning: capacityWarn, created: false });
    }
    // 按 body 上限分片
    const batches = splitEntries(enrichedEntries, cleanKeywords, summary);
    const createdDocs = [];
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const title = batches.length > 1 ? `${cleanKw}(${i + 1})` : cleanKw;
        const body = buildIndexBody(cleanKeywords, summary, batch);
        const data = await post(`/repos/${bookId}/docs`, {
            title,
            body,
            format: "markdown",
        });
        const created = data.data || data;
        const docId = created.id;
        await put(`/repos/${bookId}/toc`, {
            action: "appendNode",
            action_mode: "child",
            target_uuid: "",
            type: "DOC",
            doc_ids: [docId],
        });
        createdDocs.push({ doc_id: docId, title, entries: batch.length });
    }
    // 同步总库：创建关键词文档（entries 指向子索引库）
    let routeSynced = 0;
    try {
        const { route_book } = loadConfig();
        // 从配置中获取子索引库 namespace（bookId 匹配的第一个）
        const subNs = route_book_sub.find(b => String(b.book_id) === String(bookId))?.namespace ||
            route_book_sub[0]?.namespace ||
            default_book.namespace;
        const routeBody = `关键词：${cleanKeywords}

摘要：${summary}

entries：${JSON.stringify([{ book_id: bookId, namespace: subNs }])}`;
        for (const rb of route_book) {
            const rdata = await post(`/repos/${rb.book_id}/docs`, {
                title: cleanKw,
                body: routeBody,
                format: "markdown",
            });
            const rdoc = (rdata.data || rdata);
            await put(`/repos/${rb.book_id}/toc`, {
                action: "appendNode",
                action_mode: "child",
                target_uuid: "",
                type: "DOC",
                doc_ids: [rdoc.id],
            });
            routeSynced++;
        }
    }
    catch { /* 总库同步失败不影响子库写入 */ }
    return JSON.stringify({
        created: true,
        shards: batches.length,
        docs: createdDocs,
        keyword: cleanKw,
        total_entries: entries.length,
        route_synced: routeSynced,
    }, null, 2);
}
/**
 * 解析索引文档 body → keywords / summary / entries（仅 JSON 格式）
 */
export function parseIndexDoc(body) {
    if (!body)
        return { keywords: [], summary: "", entries: [], parse_error: "空 body" };
    const keywordsRaw = extractLine(body, "关键词：");
    const keywords = parseKeywords(keywordsRaw);
    const summary = extractSection(body, "摘要：", "entries：");
    // entries JSON — 同行或下一行
    const entriesMatch = body.match(/entries[：:]\s*\n?(\[[\s\S]*?\])\s*$/m);
    const entriesRaw = entriesMatch ? entriesMatch[1] : "";
    const missing = [];
    if (!keywords || keywords.length === 0)
        missing.push("关键词");
    if (!entriesRaw)
        missing.push("entries");
    if (missing.length > 0) {
        return { keywords: keywords || [], summary: summary || "", entries: [], parse_error: `缺少字段: ${missing.join("/")}` };
    }
    let entries = [];
    try {
        const parsed = JSON.parse(entriesRaw);
        if (Array.isArray(parsed))
            entries = parsed;
    }
    catch {
        return { keywords, summary, entries: [], parse_error: "entries JSON 解析失败" };
    }
    return { keywords, summary, entries };
}
//# sourceMappingURL=index.js.map