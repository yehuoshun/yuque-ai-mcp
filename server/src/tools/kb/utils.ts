// ─── 关键词清洗 ────────────────────────────────────────

/** 搜索 token / 关键词清洗：去空格去符号 */
export function cleanToken(token: string): string {
  return token.replace(/\s+/g, "").replace(/[@#$%`;；《》…—]/g, "");
}