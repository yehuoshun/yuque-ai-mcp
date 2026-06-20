/**
 * common/copy-common — 跨知识库文档复制公共逻辑
 *
 * 职责：源链接追尾。
 * TOC 缓存与目录创建已迁移到 common/toc-cache.ts。
 */

// ─── 源链接追尾 ──────────────────────────────────────────

/** 在 body 末尾追加源文档链接（markdown 格式） */
export function appendSourceLink(
  body: string,
  sourceUrl: string,
  sourceTitle: string,
): string {
  const footer = `\n\n---\n> 📋 源文档：[${sourceTitle}](${sourceUrl})`;
  return body + footer;
}