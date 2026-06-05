import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { cleanToken, entriesToMarkdown } from "./utils.js";
const REPO_DOC_LIMIT = 5000;
const REPO_CAPACITY_WARN_PCT = 90;
const REPO_CAPACITY_BLOCK_PCT = 97;
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
/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 Markdown 格式：每个源文档一个块（标题 + 搜索面 + 摘要 + 元数据）。
 */
export async function createIndexDoc(params) {
    const { keyword, entries } = params;
    if (!keyword)
        throw new Error("keyword 不能为空");
    if (!entries || entries.length === 0)
        throw new Error("entries 不能为空");
    const cleanKw = cleanToken(keyword);
    for (const e of entries) {
        if (!e.doc_id)
            throw new Error("每个 entry 必须有 doc_id");
        if (!e.namespace)
            throw new Error("每个 entry 必须有 namespace");
        if (!e.doc_title)
            throw new Error("每个 entry 必须有 doc_title");
        if (!e.slug)
            throw new Error("每个 entry 必须有 slug");
        if (e.weight == null || e.weight < 1 || e.weight > 10)
            throw new Error("每个 entry 必须有 weight（权重 1-10）");
    }
    const enrichedEntries = entries.map(e => ({
        doc_id: e.doc_id,
        namespace: e.namespace,
        doc_title: e.doc_title,
        slug: e.slug,
        url: e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`,
        weight: e.weight,
        keywords: e.keywords,
        search_surface: e.search_surface,
        summary: e.summary,
        tree: e.tree,
    }));
    const body = entriesToMarkdown(enrichedEntries);
    const MAX_BODY_BYTES = 200 * 1024;
    const bodyBytes = Buffer.byteLength(body, "utf-8");
    if (bodyBytes > MAX_BODY_BYTES) {
        return JSON.stringify({
            created: false,
            error: "body_too_large",
            body_bytes: bodyBytes,
            limit_bytes: MAX_BODY_BYTES,
            entry_count: enrichedEntries.length,
            hint: `索引文档 body ${(bodyBytes / 1024).toFixed(1)}KB 超过 ${MAX_BODY_BYTES / 1024}KB 上限。建议拆分关键词或减少低权重 entry。`,
        }, null, 2);
    }
    const config = loadConfig();
    const { route_books } = config;
    const bookId = route_books[0]?.book_id;
    if (!bookId) {
        return JSON.stringify({
            created: false,
            error: "route_books 未配置",
            hint: "索引库未配置。",
        });
    }
    const capacity = await checkRepoCapacity(bookId);
    if (capacity.level === "block") {
        return JSON.stringify({
            created: false,
            error: "capacity_blocked",
            current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
            hint: `索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线。`,
        });
    }
    const capacityWarning = capacity.level === "warn"
        ? `⚠️ 索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线`
        : "";
    let docId;
    let docSlug;
    let isNew = false;
    // v3: 用语雀搜索 API 查关键词索引文档是否已存在
    const routeBook = route_books.find(b => String(b.book_id) === String(bookId));
    let existingSubDoc = null;
    if (routeBook) {
        try {
            const searchData = await get(`/search?q=${encodeURIComponent(cleanKw)}&type=doc&scope=${routeBook.namespace}`);
            const results = searchData.data || [];
            const match = results.find((r) => {
                const info = r.target || r;
                return (info.title || r.title || "").trim() === cleanKw;
            });
            if (match) {
                const info = match.target || match;
                existingSubDoc = { id: info.id || match.id, slug: info.slug || match.slug || "" };
            }
        }
        catch { /* 搜索失败，走新建路径 */ }
    }
    if (existingSubDoc) {
        const putResult = await put(`/repos/${bookId}/docs/${existingSubDoc.id}`, {
            title: cleanKw,
            body,
        });
        docId = existingSubDoc.id;
        docSlug = (putResult.data || putResult).slug || existingSubDoc.slug || "";
    }
    else {
        const data = await post(`/repos/${bookId}/docs`, {
            title: cleanKw,
            body,
            format: "markdown",
        });
        const created = data.data || data;
        docId = created.id;
        docSlug = created.slug || "";
        isNew = true;
    }
    if (!docSlug) {
        throw new Error(`无法获取索引文档 slug（doc_id=${docId}），创建中断`);
    }
    if (isNew) {
        await put(`/repos/${bookId}/toc`, {
            action: "appendNode",
            action_mode: "child",
            target_uuid: "",
            type: "DOC",
            doc_ids: [docId],
        });
    }
    return JSON.stringify({
        created: isNew,
        updated: !isNew,
        doc_id: docId,
        keyword: cleanKw,
        total_entries: entries.length,
        book_id: bookId,
        ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
    }, null, 2);
}
// ─── 解析 ─────────────────────────────────────────────
/**
 * 解析索引文档 Markdown body → ParsedIndexDoc
 *
 * body 格式（每个 entry 一个 # 块）：
 *   # {doc_title}
 *
 *   ## 关键词
 *   {keyword}
 *
 *   ## 搜索面
 *   {search_surface}
 *
 *   ## 摘要
 *   {summary}
 *
 *   ## 章节树
 *   - {id}: {title} — {summary}
 *
 *   ## doc_id
 *   {doc_id}
 *   ## 链接
 *   {url}
 *   ## 权重
 *   {weight}
 */
export function parseIndexDoc(body) {
    if (!body)
        return { entries: [], parse_error: "空 body" };
    // 按 `\n# ` 分割各块
    const blocks = body.split(/\n(?=# )/).filter(b => b.trim());
    if (blocks.length === 0) {
        return { entries: [], parse_error: "未找到有效块" };
    }
    const entries = [];
    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed)
            continue;
        const entry = parseBlock(trimmed);
        if (entry)
            entries.push(entry);
    }
    if (entries.length === 0) {
        return { entries: [], parse_error: "所有块解析失败" };
    }
    return { entries };
}
/** 解析单个块 → DocEntry */
function parseBlock(block) {
    const lines = block.split("\n");
    // 第一行是 # {doc_title}
    const titleLine = lines[0]?.trim();
    const docTitle = titleLine?.startsWith("# ") ? titleLine.substring(2).trim() : "";
    // 提取 关键词、搜索面、摘要、章节树、doc_id、链接、权重
    let docId = 0;
    let url = "";
    let weight = 5;
    const keywords = [];
    const treeSections = [];
    let section = null;
    const surfaceLines = [];
    const summaryLines = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // 遇到下一个 ## 头 → 退出当前 section
        if (trimmed.startsWith("## ")) {
            if (trimmed === "## 关键词") {
                section = "keywords";
                continue;
            }
            if (trimmed === "## 搜索面") {
                section = "surface";
                continue;
            }
            if (trimmed === "## 摘要") {
                section = "summary";
                continue;
            }
            if (trimmed === "## 章节树") {
                section = "tree";
                continue;
            }
            if (trimmed === "## doc_id") {
                section = null;
                docId = parseInt((lines[i + 1] || "").trim(), 10);
                continue;
            }
            if (trimmed === "## 链接") {
                section = null;
                url = (lines[i + 1] || "").trim();
                continue;
            }
            if (trimmed === "## 权重") {
                section = null;
                weight = parseInt((lines[i + 1] || "").trim(), 10);
                continue;
            }
            // 未知 ## 头 → 退出当前 section
            section = null;
            continue;
        }
        // 空行 → 跳过（不参与任何 section 的内容收集）
        if (!trimmed)
            continue;
        // 收集当前 section 内容
        switch (section) {
            case "keywords":
                keywords.push(trimmed);
                break;
            case "surface":
                surfaceLines.push(trimmed);
                break;
            case "summary":
                summaryLines.push(trimmed);
                break;
            case "tree":
                if (trimmed.startsWith("- ")) {
                    const m = trimmed.match(/^- (\S+): (.+) — (.+)$/);
                    if (m)
                        treeSections.push({ id: m[1], title: m[2], summary: m[3] });
                }
                break;
        }
    }
    if (!docId || !url)
        return null;
    // 从 URL 提取 namespace 和 slug
    const urlMatch = url.match(/yuque\.com\/(.+?)\/(.+?)\/([^/?#]+)/);
    const namespace = urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : "";
    const slug = urlMatch ? urlMatch[3] : "";
    return {
        doc_id: docId,
        namespace,
        doc_title: docTitle,
        slug,
        url,
        weight,
        keywords: keywords.length > 0 ? keywords : undefined,
        search_surface: surfaceLines.length > 0 ? surfaceLines.join("\n") : undefined,
        summary: summaryLines.length > 0 ? summaryLines.join("\n") : undefined,
        tree: treeSections.length > 0 ? { sections: treeSections } : undefined,
    };
}
//# sourceMappingURL=index.js.map