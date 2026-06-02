import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, extractLine, extractSection, parseKeywords } from "./utils.js";
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
/** 构建索引文档 body — 一对多格式，每个 entry 自带元数据 */
function buildIndexBody(docTitle, entryGroups) {
    const parts = [`文档标题：${docTitle}`];
    for (const g of entryGroups) {
        parts.push("");
        if (g.title)
            parts.push(`文档标题：${g.title}`);
        if (g.keywords.length > 0)
            parts.push(`关键词：${JSON.stringify(g.keywords)}`);
        if (g.searchSurface)
            parts.push(`搜索面：${g.searchSurface}`);
        if (g.summary)
            parts.push(`摘要：${g.summary}`);
        parts.push(`entry：`, JSON.stringify(g.entry));
    }
    return parts.join("\n");
}
/**
 * 创建关键词索引文档（一对多）
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。一对多：一个关键词可指向多篇源文档。
 * 每个 entry 自带 文档标题/关键词/搜索面/摘要 元数据。
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
    const entryGroups = enrichedEntries.map(e => ({
        entry: e,
        title: e.et || e.t || "",
        keywords: e.ek || [],
        searchSurface: e.es,
        summary: e.esum || "",
    }));
    const docTitle = entryGroups[0]?.title || keyword;
    const body = buildIndexBody(docTitle, entryGroups);
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
    let routeSyncError = "";
    if (route_book_id) {
        try {
            const subRepo = await get(`/repos/${bookId}`);
            const subNs = subRepo.data?.namespace || subRepo.namespace || "";
            if (subNs) {
                await post(`/repos/${route_book_id}/docs`, {
                    title: cleanKw,
                    body: JSON.stringify([{ did: docId, ns: `${subNs}/${created.slug}` }]),
                    format: "markdown",
                });
                routeSyncError = "已同步";
            }
        }
        catch (e) {
            routeSyncError = `路由同步失败: ${e instanceof Error ? e.message : String(e)}`;
        }
    }
    return JSON.stringify({
        created: true,
        doc_id: docId,
        keyword: cleanKw,
        doc_title: docTitle,
        total_entries: entries.length,
        book_id: bookId,
        route_sync: route_book_id ? routeSyncError : "未启用",
        ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
    }, null, 2);
}
/**
 * 解析索引文档 body → entries。兼容新旧格式。
 */
export function parseIndexDoc(body) {
    if (!body)
        return { keywords: [], summary: "", entries: [], parse_error: "空 body" };
    const docTitle = extractLine(body, "文档标题：") || undefined;
    // 新版：多个 entry：{JSON} 块（entry 在 JSON 之后，每块以 文档标题/关键词/搜索面/摘要 开头）
    const entryBlockPattern = /entry[：:]\s*\n(?:\{[^}]*\})/g;
    let entryBlockRaw = [];
    let m;
    while ((m = entryBlockPattern.exec(body)) !== null) {
        entryBlockRaw.push(m[0].replace(/entry[：:]\s*\n/, "").trim());
    }
    // 兼容旧版
    if (entryBlockRaw.length === 0) {
        const codeMatch = body.match(/entries?[：:]\s*\n```json\s*\n([\s\S]*?)\n```/);
        if (codeMatch)
            entryBlockRaw.push(codeMatch[1]);
    }
    if (entryBlockRaw.length === 0) {
        const oldMatch = body.match(/entries?[：:]\s*\n?(\[[\s\S]*?\])\s*$/m);
        if (oldMatch)
            entryBlockRaw.push(oldMatch[1]);
    }
    // 从 body 提取每个 entry 块的元数据
    // 块结构: 文档标题 / 关键词 / 搜索面 / 摘要 / entry：{...}
    const entrySections = body.split(/\n(?=文档标题：)/);
    const keywordGroups = [];
    const summaryGroups = [];
    const searchFaces = [];
    for (const section of entrySections) {
        const kwRaw = extractLine(section, "关键词：");
        keywordGroups.push(kwRaw ? parseKeywords(kwRaw) : []);
        const sf = extractLine(section, "搜索面：");
        if (sf)
            searchFaces.push(sf);
        const sm = extractSection(section, "摘要：", "entry：");
        if (sm)
            summaryGroups.push(sm);
    }
    const allKeywords = keywordGroups.flat().filter((v, i, a) => a.indexOf(v) === i);
    if (entryBlockRaw.length === 0) {
        return { doc_title: docTitle, keywords: allKeywords, summary: summaryGroups[0] || "", entries: [], parse_error: "缺少 entry" };
    }
    let entries = [];
    try {
        for (const raw of entryBlockRaw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const e of parsed) {
                    entries.push({ did: e.did, ns: e.ns, t: e.t || "", s: e.s || "", url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`, w: e.w ?? 5 });
                }
            }
            else {
                entries.push({ did: parsed.did, ns: parsed.ns, t: parsed.t || "", s: parsed.s || "", url: parsed.url || `https://www.yuque.com/${parsed.ns}/${parsed.s}`, w: parsed.w ?? 5 });
            }
        }
    }
    catch {
        return { doc_title: docTitle, keywords: allKeywords, summary: summaryGroups[0] || "", entries: [], parse_error: "entry JSON 解析失败" };
    }
    return { doc_title: docTitle, keywords: allKeywords, summary: summaryGroups[0] || "", entries };
}
//# sourceMappingURL=index.js.map