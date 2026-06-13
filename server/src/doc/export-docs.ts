/**
 * doc/export — 批量导出知识库文档为 Markdown
 *
 * 流程：
 *   1. 分页获取全部文档列表
 *   2. 逐个获取文档详情（body + body_html）
 *   3. 解析 body_html 中的图片/附件 → 尝试下载 → 成功替换为本地路径，失败保留原链接
 *   4. 输出 Markdown 文件 + 资源目录 + 导出报告
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";
import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";

// ─── 图片/附件链接提取 ─────────────────────────────────

interface ResourceRef {
  url: string;
  localPath: string;
  type: "image" | "attachment";
}

/** 从 body_html 中提取所有资源引用 */
function extractResources(bodyHtml: string, imagesDir: string, attachmentsDir: string): ResourceRef[] {
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
    // 去掉查询参数
    const clean = base.split("?")[0];
    return clean || `file_${Date.now()}`;
  } catch {
    return `file_${Date.now()}`;
  }
}

/** 判断 URL 是否是图片（基于扩展名） */
function isImageUrl(url: string): boolean {
  const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"];
  const lower = url.toLowerCase().split("?")[0];
  return imageExts.some((ext) => lower.endsWith(ext));
}

// ─── 图片下载 ─────────────────────────────────────────

interface DownloadResult {
  url: string;
  localPath: string;
  success: boolean;
  error?: string;
}

async function downloadFile(
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

function formatFrontMatter(doc: {
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

// ─── 主工具 ───────────────────────────────────────────

export const docExport: McpTool = {
  name: "yuque_export_docs",
  description:
    "Export all documents in a repository as Markdown files with images/attachments downloaded. " +
    "Failed downloads fall back to original CDN URLs.",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Repository ID (numeric) or namespace like group/book_slug (required)",
      },
      output_dir: {
        type: "string",
        description: "Output directory path (absolute or relative). Defaults to ./yuque-export/<book_slug>/",
      },
      download_images: {
        type: "boolean",
        description: "Download images to local (default true). Set false to skip download.",
      },
      raw_body: {
        type: "boolean",
        description: "Use raw body field instead of converting body_html to markdown (default false)",
      },
    },
    required: ["book_id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const bookId = args?.book_id as string;
    const downloadImages = args?.download_images !== false;
    const rawBody = args?.raw_body === true;

    // ── 1. 获取知识库信息和全部文档列表 ──
    const repoData = await apiGet(`/repos/${bookId}`, undefined, "Export: get repo");
    if (isErrorResult(repoData)) return repoData;

    const repo = (repoData as { data?: { slug?: string; name?: string } }).data || {};
    const bookSlug = repo.slug || bookId.replace(/\//g, "_");

    const outputDir = (args?.output_dir as string) || `./yuque-export/${bookSlug}`;
    const imagesDir = join(outputDir, "images");
    const attachmentsDir = join(outputDir, "attachments");

    // ── 2. 分页获取全部文档 ──
    const allDocs: Array<{ id: number; slug: string; title: string }> = [];
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const listData = await apiGet(
        `/repos/${bookId}/docs`,
        { offset: String(offset), limit: String(pageSize) },
        "Export: list docs",
      );
      if (isErrorResult(listData)) return listData;

      const list = listData as { data?: Array<{ id: number; slug: string; title: string }> };
      const docs = list.data || [];
      allDocs.push(...docs);

      if (docs.length < pageSize) break;
      offset += pageSize;
    }

    if (allDocs.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "empty",
            message: `知识库 "${bookSlug}" 没有文档 / No documents in repository`,
          }, null, 2),
        }],
      };
    }

    // ── 3. 创建输出目录 ──
    await mkdir(outputDir, { recursive: true });
    if (downloadImages) {
      await mkdir(imagesDir, { recursive: true });
      await mkdir(attachmentsDir, { recursive: true });
    }

    // ── 4. 逐个导出文档 ──
    const results: Array<{
      doc_id: number;
      slug: string;
      title: string;
      status: "ok" | "error";
      file: string;
      images_downloaded: number;
      images_failed: number;
      error?: string;
    }> = [];

    let totalImagesDownloaded = 0;
    let totalImagesFailed = 0;

    for (const docMeta of allDocs) {
      try {
        // 获取文档详情
        const docData = await apiGet(
          `/repos/docs/${docMeta.id}`,
          { page_size: "200", page: "1" },
          `Export: get doc ${docMeta.id}`,
        );

        if (isErrorResult(docData)) {
          results.push({
            doc_id: docMeta.id,
            slug: docMeta.slug,
            title: docMeta.title,
            status: "error",
            file: "",
            images_downloaded: 0,
            images_failed: 0,
            error: "Failed to fetch doc",
          });
          continue;
        }

        const doc = (docData as { data?: Record<string, unknown> }).data || {};
        const body = (doc.body as string) || "";
        const bodyHtml = (doc.body_html as string) || "";
        const format = (doc.format as string) || "markdown";
        const title = (doc.title as string) || "无标题";
        const slug = (doc.slug as string) || `doc_${docMeta.id}`;
        const createdAt = (doc.created_at as string) || "";
        const updatedAt = (doc.updated_at as string) || "";
        const wordCount = (doc.word_count as number) || 0;
        const description = (doc.description as string) || "";

        // ── 提取资源并下载 ──
        let resourceMap = new Map<string, DownloadResult>();

        if (downloadImages && bodyHtml) {
          const resources = extractResources(bodyHtml, imagesDir, attachmentsDir);

          for (const res of resources) {
            const destPath = join(outputDir, res.localPath);
            // 跳过已下载的
            if (existsSync(destPath)) {
              resourceMap.set(res.url, { url: res.url, localPath: res.localPath, success: true });
              continue;
            }
            const result = await downloadFile(res.url, destPath, cfg.token);
            resourceMap.set(res.url, result);
          }
        }

        // ── 生成 Markdown 内容 ──
        let markdown = "";

        if (format === "markdown" && !rawBody) {
          markdown = body;
        } else if (bodyHtml && !rawBody) {
          // HTML → 简单 Markdown 转换
          markdown = htmlToMarkdown(bodyHtml);
        } else {
          // rawBody 模式：直接输出 body 字段
          markdown = body || JSON.stringify(doc, null, 2);
        }

        // 替换图片引用为本地路径
        let imagesDownloaded = 0;
        let imagesFailed = 0;

        for (const [url, result] of resourceMap) {
          if (result.success) {
            imagesDownloaded++;
            // 替换所有引用
            markdown = markdown.replaceAll(url, result.localPath);
          } else {
            imagesFailed++;
            // 保留原 URL，不替换
          }
        }

        totalImagesDownloaded += imagesDownloaded;
        totalImagesFailed += imagesFailed;

        // 添加 frontmatter
        const frontmatter = formatFrontMatter({
          title,
          slug,
          created_at: createdAt,
          updated_at: updatedAt,
          word_count: wordCount,
          description,
        });

        const fileName = sanitizeFilename(slug) + ".md";
        const filePath = join(outputDir, fileName);

        await writeFile(filePath, frontmatter + markdown, "utf-8");

        results.push({
          doc_id: docMeta.id,
          slug,
          title,
          status: "ok",
          file: filePath,
          images_downloaded: imagesDownloaded,
          images_failed: imagesFailed,
        });
      } catch (err) {
        results.push({
          doc_id: docMeta.id,
          slug: docMeta.slug,
          title: docMeta.title,
          status: "error",
          file: "",
          images_downloaded: 0,
          images_failed: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── 5. 生成导出报告 ──
    const okCount = results.filter((r) => r.status === "ok").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    const report = {
      status: "done",
      repo: {
        id: bookId,
        slug: bookSlug,
        name: repo.name,
      },
      output_dir: outputDir,
      summary: {
        total_docs: allDocs.length,
        ok: okCount,
        error: errorCount,
        images_downloaded: totalImagesDownloaded,
        images_failed: totalImagesFailed,
      },
      files: results,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
};

// ─── 辅助函数 ─────────────────────────────────────────

/** 安全文件名：去除非法字符 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").substring(0, 200);
}

/** 简单 HTML → Markdown 转换 */
function htmlToMarkdown(html: string): string {
  let md = html;

  // 标题
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (_, c) => `\n# ${stripHtml(c)}\n`);
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (_, c) => `\n## ${stripHtml(c)}\n`);
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (_, c) => `\n### ${stripHtml(c)}\n`);
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, (_, c) => `\n#### ${stripHtml(c)}\n`);
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, (_, c) => `\n##### ${stripHtml(c)}\n`);
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, (_, c) => `\n###### ${stripHtml(c)}\n`);

  // 粗体/斜体
  md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, "**$2**");
  md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, "*$2*");

  // 链接
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // 图片
  md = md.replace(/<img[^>]+src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // 段落
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, (_, c) => `\n${stripHtml(c)}\n`);

  // 换行
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // 无序列表
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, (_, c) => `- ${stripHtml(c)}`);

  // 代码块
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, (_, c) => `\n\`\`\`\n${unescapeHtml(c)}\n\`\`\`\n`);
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // 删除线
  md = md.replace(/<(del|s|strike)[^>]*>(.*?)<\/(del|s|strike)>/gi, "~~$2~~");

  // 分割线
  md = md.replace(/<hr\s*\/?>/gi, "\n---\n");

  // 移除剩余 HTML 标签
  md = md.replace(/<[^>]+>/g, "");

  // 解码 HTML 实体
  md = unescapeHtml(md);

  // 清理多余空行
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}