// ─── 关键词清洗 ────────────────────────────────────────

/** 搜索 token / 关键词清洗：去空格去符号 */
export function cleanToken(token: string): string {
  return token.replace(/\s+/g, "").replace(/[@#$%`;；《》…—]/g, "");
}

/** 关键词数组 → 清洗 + JSON 序列化 */
export function cleanKeywordsArray(keywords: string[]): string {
  return JSON.stringify(keywords.map(cleanToken));
}

// ─── 文本提取 ──────────────────────────────────────────

export function extractLine(text: string, label: string): string {
  const regex = new RegExp(`${escapeRegex(label)}(.+)`, "m");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

export function extractSection(text: string, startLabel: string, endLabel: string): string {
  const startIdx = text.indexOf(startLabel);
  if (startIdx === -1) return "";
  const after = text.slice(startIdx + startLabel.length);
  const endIdx = after.indexOf(endLabel);
  return (endIdx === -1 ? after : after.slice(0, endIdx)).trim();
}

export function parseKeywords(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
}

// ─── 内部 ──────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}