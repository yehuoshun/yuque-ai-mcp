// ─── 关键词清洗 ────────────────────────────────────────
/** 搜索 token / 关键词清洗：去空格去符号 */
export function cleanToken(token) {
    return token.replace(/\s+/g, "").replace(/[@#$%`;；《》…—]/g, "");
}
//# sourceMappingURL=utils.js.map