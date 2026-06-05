// ─── 关键词清洗 ────────────────────────────────────────
/** 搜索 token / 关键词清洗：去空格 + 去所有非字母数字中文的符号 */
export function cleanToken(token) {
    return token.replace(/\s+/g, "").replace(/[^\w\u4e00-\u9fff]/g, "");
}
// ─── 索引文档序列化 ────────────────────────────────────
/**
 * 将 DocEntry[] 序列化为 Markdown body
 *
 * 格式（每个 entry 一块）：
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
export function entriesToMarkdown(entries) {
    const blocks = entries.map(e => {
        const title = e.doc_title || "";
        const surface = (e.search_surface || "").trim();
        const summary = (e.summary || "").trim();
        const url = e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`;
        const lines = [];
        lines.push(`# ${title}`);
        if (e.keywords && e.keywords.length > 0) {
            lines.push("");
            lines.push("## 关键词");
            for (const kw of e.keywords) {
                lines.push(kw);
            }
        }
        if (surface) {
            lines.push("");
            lines.push("## 搜索面");
            lines.push(surface);
        }
        if (summary) {
            lines.push("");
            lines.push("## 摘要");
            lines.push(summary);
        }
        if (e.tree && e.tree.sections && e.tree.sections.length > 0) {
            lines.push("");
            lines.push("## 章节树");
            for (const sec of e.tree.sections) {
                lines.push(`- ${sec.id}: ${sec.title} — ${sec.summary}`);
            }
        }
        lines.push("");
        lines.push("## doc_id");
        lines.push(String(e.doc_id));
        lines.push("## 链接");
        lines.push(url);
        lines.push("## 权重");
        lines.push(String(e.weight));
        return lines.join("\n");
    });
    return blocks.join("\n\n") + "\n";
}
//# sourceMappingURL=utils.js.map