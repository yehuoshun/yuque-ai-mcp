/**
 * doc/export-repo — 批量导出知识库全部文档为 Markdown
 *
 * 流程：
 *   1. 分页获取全部文档列表
 *   2. 逐个获取文档详情（body + body_html）
 *   3. 解析 body_html 中的图片/附件 → 尝试下载 → 成功替换为本地路径，失败保留原链接
 *   4. 输出 Markdown 文件 + 资源目录 + 导出报告
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import {
  extractResources,
  downloadFile,
  formatFrontMatter,
  sanitizeFilename,
  htmlToMarkdown,
} from "../doc/export-common.js";

export const docExportRepo: McpTool = {
  name: "yuque_export_repo",
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

    // ── 1. 获取知识库信息 ──
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
    const results = await exportDocs(
      allDocs,
      outputDir,
      imagesDir,
      attachmentsDir,
      downloadImages,
      rawBody,
      cfg.token,
    );

    // ── 5. 生成导出报告 ──
    const okCount = results.filter((r) => r.status === "ok").length;
    const errorCount = results.filter((r) => r.status === "error").length;
    const totalImagesDownloaded = results.reduce((sum, r) => sum + r.images_downloaded, 0);
    const totalImagesFailed = results.reduce((sum, r) => sum + r.images_failed, 0);

    const report = {
      status: "done",
      repo: { id: bookId, slug: bookSlug, name: repo.name },
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

// ─── 批量导出实现 ─────────────────────────────────────

interface ExportResult {
  doc_id: number;
  slug: string;
  title: string;
  status: "ok" | "error";
  file: string;
  images_downloaded: number;
  images_failed: number;
  error?: string;
}

async function exportDocs(
  allDocs: Array<{ id: number; slug: string; title: string }>,
  outputDir: string,
  imagesDir: string,
  attachmentsDir: string,
  downloadImages: boolean,
  rawBody: boolean,
  token: string,
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (const docMeta of allDocs) {
    try {
      const docData = await apiGet(
        `/repos/docs/${docMeta.id}`,
        { page_size: "200", page: "1" },
        `Export: get doc ${docMeta.id}`,
      );

      if (isErrorResult(docData)) {
        results.push({
          doc_id: docMeta.id, slug: docMeta.slug, title: docMeta.title,
          status: "error", file: "", images_downloaded: 0, images_failed: 0,
          error: "Failed to fetch doc",
        });
        continue;
      }

      const result = await exportSingleDoc(
        docData,
        docMeta,
        outputDir,
        imagesDir,
        attachmentsDir,
        downloadImages,
        rawBody,
        token,
      );
      results.push(result);
    } catch (err) {
      results.push({
        doc_id: docMeta.id, slug: docMeta.slug, title: docMeta.title,
        status: "error", file: "", images_downloaded: 0, images_failed: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export async function exportSingleDoc(
  docData: unknown,
  docMeta: { id: number; slug: string; title: string },
  outputDir: string,
  imagesDir: string,
  attachmentsDir: string,
  downloadImages: boolean,
  rawBody: boolean,
  token: string,
): Promise<ExportResult> {
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

  let imagesDownloaded = 0;
  let imagesFailed = 0;

  // 提取资源并下载
  let resourceMap = new Map<string, { url: string; localPath: string; success: boolean }>();

  if (downloadImages && bodyHtml) {
    const resources = extractResources(bodyHtml, imagesDir, attachmentsDir);

    for (const res of resources) {
      const destPath = join(outputDir, res.localPath);
      if (existsSync(destPath)) {
        resourceMap.set(res.url, { url: res.url, localPath: res.localPath, success: true });
        continue;
      }
      const result = await downloadFile(res.url, destPath, token);
      resourceMap.set(res.url, result);
    }
  }

  // 生成 Markdown 内容
  let markdown = "";

  if (format === "markdown" && !rawBody) {
    markdown = body;
  } else if (bodyHtml && !rawBody) {
    markdown = htmlToMarkdown(bodyHtml);
  } else {
    markdown = body || JSON.stringify(doc, null, 2);
  }

  // 替换图片引用
  for (const [url, result] of resourceMap) {
    if (result.success) {
      imagesDownloaded++;
      markdown = markdown.replaceAll(url, result.localPath);
    } else {
      imagesFailed++;
    }
  }

  // 添加 frontmatter
  const frontmatter = formatFrontMatter({
    title, slug,
    created_at: createdAt, updated_at: updatedAt,
    word_count: wordCount, description,
  });

  const fileName = sanitizeFilename(slug) + ".md";
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, frontmatter + markdown, "utf-8");

  return {
    doc_id: docMeta.id, slug, title,
    status: "ok", file: filePath,
    images_downloaded: imagesDownloaded,
    images_failed: imagesFailed,
  };
}