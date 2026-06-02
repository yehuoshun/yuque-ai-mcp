import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";
// 容量上限（语雀单库文档上限约 5000）
const REPO_DOC_LIMIT = 5000;
// 扩容阈值：到达此比例时提示需要新建子库
const REPO_CAPACITY_WARN_PCT = 90;
// 阻塞阈值：到达此比例时拒绝写入
const REPO_CAPACITY_BLOCK_PCT = 97;
// 语雀单篇文档 body 上限约 200KB，单 entry 不会超，保留常量供参考
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
function buildIndexBody(docTitle, keywords, searchSurface, summary, entries) {
    const parts = [
        `文档标题：${docTitle}`,
        ``,
        `关键词：${keywords}`,
    ];
    if (searchSurface) {
        parts.push(``, `搜索面：${searchSurface}`);
    }
    parts.push(``, `摘要：${summary}`);
    for (const entry of entries) {
        parts.push(``, `entry：`, JSON.stringify(entry));
    }
    return parts.join("\n");
}
/** body 模板开销（不含 entry JSON），用于估算单篇可容纳的 entry 数 */
function buildBodyOverhead(docTitle, keywords, searchSurface, summary) {
    const parts = [
        `文档标题：${docTitle}`,
        ``,
        `关键词：${keywords}`,
    ];
    if (searchSurface) {
        parts.push(``, `搜索面：${searchSurface}`);
    }
    parts.push(``, `摘要：${summary}`, ``, `entry：`, `\`\`\`json`, ``, `\`\`\``);
    return parts.join("\n");
}
/**
 * 创建关键词索引文档（v5 — 一对一精准锚点）
 *
 * 一个关键词 = 一篇源文档 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * entries 必须且只有 1 个。
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":9}]
 */
export async function createIndexDoc(params) {
    const { keyword, keywords, search_surface, summary, entries, index_book_id, route_book_id } = params;
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
    const enrichedEntries = entries.map(e => ({
        ...e,
        url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
    }));
    const config = loadConfig();
    const { route_book, route_book_sub, default_book } = config;
    // 校验：传入的 index_book_id 必须匹配配置中的 route_book_sub
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
    // 校验：传入的 route_book_id 必须匹配配置中的 route_book
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
    const docTitle = enrichedEntries[0]?.t || keyword;
    const body = buildIndexBody(docTitle, cleanKeywords, search_surface, summary, enrichedEntries);
    const data = await post(`/repos/${bookId}/docs`, {
        title: cleanKw,
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
    const createdDocs = [{ doc_id: docId, title: cleanKw, slug: created.slug, entries: entries.length }];
    const routeBookId = route_book_id;
    // 当传了 route_book_id 时，自动在总库创建路由文档（单文档粒度原子操作）
    // 路由标题=关键词，body=[{"did": <索引文档did>, "ns": "<子库ns>/<slug>"}]
    let routeSyncError = "";
    if (routeBookId && createdDocs.length > 0) {
        try {
            const subRepo = await get(`/repos/${bookId}`);
            const subNs = subRepo.data?.namespace || subRepo.namespace || "";
            if (subNs) {
                for (const doc of createdDocs) {
                    await post(`/repos/${route_book_id}/docs`, {
                        title: doc.title,
                        body: JSON.stringify([{ did: doc.doc_id, ns: `${subNs}/${doc.slug}` }]),
                        format: "markdown",
                    });
                }
                routeSyncError = "已同步";
            }
        }
        catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            routeSyncError = `路由同步失败: ${errMsg}`;
        }
    }
    return JSON.stringify({
        created: true,
        doc_id: docId,
        keyword: cleanKw,
        doc_title: docTitle,
        total_entries: entries.length,
        book_id: bookId,
        route_sync: routeBookId ? routeSyncError : "未启用",
        ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
    }, null, 2);
}
/**
 * 解析索引文档 body → keywords / summary / entries
 */
export function parseIndexDoc(body) {
    if (!body)
        return { keywords: [], summary: "", entries: [], parse_error: "空 body" };
    const docTitle = extractLine(body, "文档标题：") || undefined;
    const keywordsRaw = extractLine(body, "关键词：");
    const keywords = parseKeywords(keywordsRaw);
    const searchSurface = extractSection(body, "搜索面：", "摘要：") || undefined;
    const summary = extractSection(body, "摘要：", "entry：");
    // 新版格式：多个 entry：{JSON 对象} 块
    const entryBlockPattern = /entry[：:]\s*\n(\{[\s\S]*?\})\s*(?=\nentry[：:]|\n*$)/g;
    // 兼容旧版：entries 在 ```json 代码块内
    const codeBlockMatch = body.match(/entries?[：:]\s*\n```json\s*\n([\s\S]*?)\n```/);
    // 兼容旧版：entries 裸 JSON 数组
    const oldRawMatch = body.match(/entries[：:]\s*\n?(\[[\s\S]*?\])\s*$/m);
    let entryBlockRaw = [];
    let match;
    while ((match = entryBlockPattern.exec(body)) !== null) {
        entryBlockRaw.push(match[1]);
    }
    if (entryBlockRaw.length === 0 && codeBlockMatch) {
        entryBlockRaw.push(codeBlockMatch[1]);
    }
    if (entryBlockRaw.length === 0 && oldRawMatch) {
        entryBlockRaw.push(oldRawMatch[1]);
    }
    const missing = [];
    if (!keywords || keywords.length === 0)
        missing.push("关键词");
    if (entryBlockRaw.length === 0)
        missing.push("entry");
    if (missing.length > 0) {
        return { doc_title: docTitle, keywords: keywords || [], summary: summary || "", entries: [], parse_error: `缺少字段: ${missing.join("/")}` };
    }
    let entries = [];
    try {
        // 新版：逐块解析 entry JSON 对象
        for (const raw of entryBlockRaw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // 兼容旧版 entries 数组
                for (const e of parsed) {
                    entries.push({
                        did: e.did,
                        ns: e.ns,
                        t: e.t || "",
                        s: e.s || "",
                        url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
                        w: e.w ?? 5,
                    });
                }
            }
            else {
                entries.push({
                    did: parsed.did,
                    ns: parsed.ns,
                    t: parsed.t || "",
                    s: parsed.s || "",
                    url: parsed.url || `https://www.yuque.com/${parsed.ns}/${parsed.s}`,
                    w: parsed.w ?? 5,
                });
            }
        }
    }
    catch {
        return { doc_title: docTitle, keywords, search_surface: searchSurface, summary, entries: [], parse_error: "entry JSON 解析失败" };
    }
    return { doc_title: docTitle, keywords, search_surface: searchSurface, summary, entries };
}
//# sourceMappingURL=index.js.map