/**
 * common/export-common — 导出工具公共函数
 *
 * 被 export-repo.ts（批量导出）和 export-doc.ts（单篇导出）共享。
 */

import { writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { unescapeHtml } from "./text-utils.js";
import { fetchWithRetry } from "./api-client.js";

// ─── 导出目录围栏 ───────────────────────────────────────

/**
 * 解析并校验导出目录：必须落在 YUQUE_EXPORT_ROOT（默认进程 cwd）之内。
 * 三个导出工具（export_repo / export_doc / export_resources）共用，
 * 避免「只给 export_repo 加了围栏、另外两个仍可写任意绝对路径」的绕过面。
 */
export function resolveExportDir(rawOutputDir: string): { dir: string; error?: string } {
  const root = resolve(process.env.YUQUE_EXPORT_ROOT || process.cwd());
  // 根目录本身是文件系统根时，围栏等于失效（任何绝对路径都在它之下），直接拒绝
  if (root === resolve(root, sep)) {
    return { dir: root, error: "YUQUE_EXPORT_ROOT 不能是文件系统根目录，请指定一个具体的导出根（如 D:/yuque-export 或 /data/yuque）" };
  }
  // 根目录在 POSIX 下是 "/"，直接用 root + sep 会变成 "//"，把合法子路径误判为越界
  const base = root.endsWith(sep) ? root : root + sep;
  const dir = resolve(root, rawOutputDir);
  if (dir !== root && !dir.startsWith(base)) {
    return { dir, error: `output_dir 必须位于 ${root} 之内（可设置 YUQUE_EXPORT_ROOT 放宽）: ${dir}` };
  }
  return { dir };
}

// ─── 资源提取 ─────────────────────────────────────────

export interface ResourceRef {
  url: string;
  localPath: string;
  type: "image" | "attachment";
}

/** 从 body_html 中提取所有资源引用。localPath 为相对于 outputDir 的路径（如 images/foo.png） */
export function extractResources(bodyHtml: string): ResourceRef[] {
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
    resources.push({ url, localPath: join("images", name), type: "image" });
  }

  // 提取 Markdown 图片 ![](url)
  const mdImgRegex = /!\[.*?\]\(([^)]+)\)/g;
  while ((match = mdImgRegex.exec(bodyHtml)) !== null) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const name = urlToFilename(url);
    resources.push({ url, localPath: join("images", name), type: "image" });
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

// 语雀的图片/附件只会落在这些域名上。原实现对 body_html 里抽出的任意 URL 都附带用户认证头去下载：
// 文档正文里写一个 <img src="https://attacker/"> 就能拿到用户 token（同时也构成 SSRF）。
const TRUSTED_RESOURCE_HOSTS = (process.env.YUQUE_TRUSTED_RESOURCE_HOSTS || "yuque.com,nlark.com,yuque.net")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** 只允许 https/http + 白名单域名；IP 字面量、localhost、内网主机名一律拒绝 */
export function isTrustedResourceUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || host.endsWith(".localhost")) return false;
  return TRUSTED_RESOURCE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export async function downloadFile(
  url: string,
  destPath: string,
  _token?: string,
): Promise<DownloadResult> {
  // 下载资源不携带任何凭据（语雀 CDN 的图片本来就是签名 URL，不需要 token）
  if (!isTrustedResourceUrl(url)) {
    return { url, localPath: destPath, success: false, error: "非语雀资源域名，已跳过下载（不发送任何凭据）" };
  }
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "yuque-ai-mcp/2.1.0",
      },
    }, `Download: ${url}`);

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

/** 安全文件名：去除非法字符、按 UTF-8 字节截断、去掉结尾点与空格
 *  Linux（ext4/xfs、Docker overlayfs）单个文件名上限是 255 字节，不是 255 个字符：
 *  200 个汉字 = 600 字节，按字符截断在 Linux 上会 ENAMETOOLONG 导致整篇导出失败。
 *  这里按 180 字节截断给 ".md" 和去重后缀留余量，并且不切断代理对/多字节序列。 */
export function sanitizeFilename(name: string): string {
  let out = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  // Windows 不允许结尾的点与空格（Linux 允许），交叉导出时统一去掉
  out = out.replace(/[. ]+$/, "");
  const encoder = new TextEncoder();
  if (encoder.encode(out).length > 180) {
    let bytes = 0;
    let cut = "";
    for (const ch of out) {
      const n = encoder.encode(ch).length;
      if (bytes + n > 180) break;
      bytes += n;
      cut += ch;
    }
    out = cut;
  }
  return out || "untitled";
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
