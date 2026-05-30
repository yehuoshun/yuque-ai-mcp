import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";
// 容量上限（语雀单库文档上限约 5000）
const REPO_DOC_LIMIT = 5000;
// 扩容阈值：到达此比例时提示需要新建子库
const REPO_CAPACITY_WARN_PCT = 90;
// 阻塞阈值：到达此比例时拒绝写入
const REPO_CAPACITY_BLOCK_PCT = 97;
// 语雀单篇文档 body 上限约 200KB，留 5KB 安全余量
const YUQUE_BODY_MAX = 195 * 1024;
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
 * 创建关键词索引文档（v4 — 关键词中心）
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
        if (e.w == null || e.w < 1 || e.w > 10)
            throw new Error("每个 entry 必须有 w（权重 1-10）");
    }
    // 为每个 entry 补 url（https://www.yuque.com/{ns}/{s}）
    const enrichedEntries = entries.map(e => ({
        ...e,
        url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
    }));
    const config = loadConfig();
    const { route_book_sub, default_book } = config;
    const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
    if (!bookId) {
        return JSON.stringify({
            created: false,
            error: "route_book_sub 未配置",
            hint: "子索引库未配置。请先创建子索引库并写入 config 的 route_book_sub：\n1. yuque_create_repo → 创建 index-{domain}\n2. yuque_config_update → 追加 route_book_sub\n或通知 Agent 代为执行这两步。",
        });
    }
    // 容量检查
    const capacity = await checkRepoCapacity(bookId);
    if (capacity.level === "block") {
        return JSON.stringify({
            created: false,
            error: "capacity_blocked",
            current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
            hint: `子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线。需要新建子索引库：\n1. yuque_create_repo → 创建 index-{domain}-2\n2. yuque_config_update → 追加 route_book_sub\n3. 重新调本工具，传新的 index_book_id。`,
        });
    }
    const capacityWarning = capacity.level === "warn"
        ? `⚠️ 子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线，建议提前准备新子库。`
        : "";
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
    // 同步总库：关键词文档，entries 指向子库里刚创建的索引文档
    let routeSynced = 0;
    try {
        const { route_book } = loadConfig();
        // 从配置中获取子索引库 namespace（bookId 匹配的第一个）
        const subNs = route_book_sub.find(b => String(b.book_id) === String(bookId))?.namespace ||
            route_book_sub[0]?.namespace ||
            default_book.namespace;
        const routeBody = `关键词：${cleanKeywords}

摘要：${summary}

entries：${JSON.stringify(createdDocs.map(d => ({ did: d.doc_id, ns: subNs })))}`;
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
        book_id: bookId,
        ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
    }, null, 2);
}
/**
 * 解析索引文档 body → keywords / summary / entries
 */
export function parseIndexDoc(body) {
    if (!body)
        return { keywords: [], summary: "", entries: [], parse_error: "空 body" };
    const keywordsRaw = extractLine(body, "关键词：");
    const keywords = parseKeywords(keywordsRaw);
    const summary = extractSection(body, "摘要：", "entries：");
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
        if (Array.isArray(parsed)) {
            entries = parsed.map((e) => ({
                did: e.did,
                ns: e.ns,
                t: e.t || "",
                s: e.s || "",
                url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
                w: e.w ?? 5,
            }));
        }
    }
    catch {
        return { keywords, summary, entries: [], parse_error: "entries JSON 解析失败" };
    }
    return { keywords, summary, entries };
}
//# sourceMappingURL=index.js.map