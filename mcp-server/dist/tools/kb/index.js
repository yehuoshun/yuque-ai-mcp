import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";
// 容量上限（语雀单库文档上限约 5000，远远大于索引规模，此检查仅兜底）
const REPO_DOC_LIMIT = 5000;
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
/**
 * 创建关键词索引文档（v3 — 关键词中心）
 *
 * 一个关键词 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
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
    // 为每个 entry 补 url（https://www.yuque.com/{ns}/{s}）
    const enrichedEntries = entries.map(e => ({
        ...e,
        url: e.url || (e.ns && e.s ? `https://www.yuque.com/${e.ns}/${e.s}` : undefined),
    }));
    const body = [
        `关键词：${cleanKeywords}`,
        ``,
        `摘要：${summary}`,
        ``,
        `entries：`,
        JSON.stringify(enrichedEntries),
    ].join("\n");
    const { route_book_sub, default_book } = loadConfig();
    const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
    if (!bookId)
        throw new Error("未指定 index_book_id 且未配置 route_book_sub 或 default_book");
    // 容量检查
    const capacityWarn = await checkRepoCapacity(bookId, "子索引库");
    if (capacityWarn) {
        return JSON.stringify({ warning: capacityWarn, created: false });
    }
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
    return JSON.stringify({
        created: true,
        doc_id: docId,
        keyword: cleanKw,
        entries: entries.length,
        title: cleanKw,
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
    const entriesRaw = extractLine(body, "entries：");
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