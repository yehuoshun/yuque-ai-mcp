/**
 * common/html-cleaner — HTML 内容提取与清洗
 *
 * 被 import-url.ts 等工具共用。
 * 职责：从原始 HTML 中提取可读正文，转为 Markdown 或保留 HTML 格式。
 */

import { escapeHtml } from "./text-utils.js";

/**
 * 从原始 HTML 中提取并清洗正文内容。
 *
 * @param html 原始 HTML 字符串
 * @param format 输出格式：markdown（转纯文本+链接）或 html（保留 HTML 结构）
 * @returns 清洗后的内容字符串
 */
export function extractAndCleanContent(html: string, format: "markdown" | "html"): string {
  // 1. 移除噪音标签（script/style/nav/footer/header/aside/noscript/iframe）
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");

  // 2. 优先提取 <article> 或 <main>
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) cleaned = articleMatch[1];
  else if (mainMatch) cleaned = mainMatch[1];

  // 3. format=html：保留 HTML 结构，只做噪音清理
  if (format === "html") {
    // 移除注释
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");
    // 限制长度
    if (cleaned.length > 100000) {
      cleaned = cleaned.substring(0, 100000) + "\n<p>... (内容过长，已截断)</p>";
    }
    return cleaned.trim();
  }

  // 4. format=markdown：转为纯文本（保留链接并转 Markdown）
  // 4a. 保留 <a href> 转为 [text](href)
  cleaned = cleaned.replace(/<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    return cleanText ? `[${cleanText}](${href})` : "";
  });

  // 4b. 保留 <img> 转为 ![alt](src)
  cleaned = cleaned.replace(/<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![$1]($2)");
  cleaned = cleaned.replace(/<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  cleaned = cleaned.replace(/<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");

  // 4c. 块级标签 → 换行
  let text = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  // 5. HTML 实体解码
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // 6. 清理空白
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  // 7. 合并连续空行
  text = text.replace(/\n{3,}/g, "\n\n");

  // 8. 限制长度
  if (text.length > 100000) {
    text = text.substring(0, 100000) + "\n\n... (内容过长，已截断)";
  }

  return text;
}

/**
 * 按 format 追尾源链接：markdown 用 appendSourceLink，html 用 HTML 格式
 */
export function appendSourceLinkByFormat(
  body: string,
  sourceUrl: string,
  sourceTitle: string,
  format: string,
): string {
  if (format === "html") {
    const footer = `<hr>\n<blockquote>📋 源文档：<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceTitle)}</a></blockquote>`;
    return body + "\n" + footer;
  }
  // markdown 格式：由调用方 import appendSourceLink from copy-common
  return body;
}