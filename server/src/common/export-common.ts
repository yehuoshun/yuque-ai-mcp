/**
 * common/export-common — 导出工具公共函数
 *
 * 被 export-repo.ts（批量导出）和 export-doc.ts（单篇导出）共享。
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unescapeHtml } from "./text-utils.js";

// ─── 资源提取 ─────────────────────────────────────────

export interface ResourceRef {
  url: string;
  localPath: string;
  type: "image" | "attachment";
}

/** 从 body_html 中提取所有资源引用 */
export function extractResources(bodyHtml: string, imagesDir: string, attachmentsDir: string): ResourceRef[] {
  const resources: ResourceRef[] = [];
  const seen = new Set<string>();

  // 提取 <img src="...">
  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let match;
  while ((match = imgRegex.exec(bodyHtml)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const name = urlToFilename(url);
    resources.push({ url, localPath: join(imagesDir, name), type: "image" });
  }

  // 提取 Markdown 图片 ![](url)
  const mdImgRegex = /!\[.*?\]\(([^)]+)\)/g;
  while ((match = mdImgRegex.exec(bodyHtml)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const name = urlToFilename(url);
    resources.push({ url, localPath: join(imagesDir, name), type: "image" });
  }

  return resources;
}

/** URL → 安全文件名 */
function urlToFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const base = pathname.split("/").pop() || "file";
    const clean = base.split("?")[0];
    return clean || `file_${Date.now()}`;
  } catch {
    return `file_${Date.now()}`;
  }
}

// ─── 图片下载 ─────────────────────────────────────────

export interface DownloadResult {
  url: string;
  localPath: string;
  success: boolean;
  error?: string;
}

export async function downloadFile(
  url: string,
  destPath: string,
  token: string,
): Promise<DownloadResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(url, {
      headers: {
        "X-Auth-Token": token,
        "User-Agent": "yuque-ai-mcp/2.1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { url, localPath: destPath, success: false, error: `HTTP ${res.status}` };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(destPath, buffer);
    return { url, localPath: destPath, success: true };
  } catch (err) {
    return {
      url,
      localPath: destPath,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Markdown 生成 ────────────────────────────────────

export function formatFrontMatter(doc: {
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  description?: string;
}): string {
  return [
    "---",
    `title: "${doc.title.replace(/"/g, '\\"')}"`,
    `slug: ${doc.slug}`,
    `created: ${doc.created_at}`,
    `updated: ${doc.updated_at}`,
    `word_count: ${doc.word_count}`,
    ...(doc.description ? [`description: "${doc.description.replace(/"/g, '\\"')}"`] : []),
    "---",
    "",
  ].join("\n");
}

// ─── 辅助函数 ─────────────────────────────────────────

/** 安全文件名：去除非法字符 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 200);
}

/** 简单 HTML → Markdown 转换 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, c) => `\n# ${stripHtml(c)}\n`);
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, c) => `\n## ${stripHtml(c)}\n`);
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, c) => `\n### ${stripHtml(c)}\n`);
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, c) => `\n#### ${stripHtml(c)}\n`);
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_, c) => `\n##### ${stripHtml(c)}\n`);
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_, c) => `\n###### ${stripHtml(c)}\n`);

  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, "**$2**");
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, "*$2*");

  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, (_, c) => `\n${stripHtml(c)}\n`);
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, (_, c) => `- ${stripHtml(c)}`);

  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, (_, c) => `\n\`\`\`\n${unescapeHtml(c)}\n\`\`\`\n`);
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  md = md.replace(/<(del|s|strike)[^>]*>(.*?)<\/(del|s|strike)>/gi, "~~$2~~");
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

  md = md.replace(/<[^>]+>/g, "");
  md = unescapeHtml(md);
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

export { unescapeHtml } from "./text-utils.js";
