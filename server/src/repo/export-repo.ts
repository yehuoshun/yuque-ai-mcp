/**
 * doc/export-repo — 批量导出知识库全部文档为 Markdown
 *
 * 流程：
 *   1. 获取 TOC 目录树 → 构建目录结构
 *   2. 分页获取全部文档列表
 *   3. 逐个获取文档详情（body + body_html）
 *   4. 解析 body_html 中的图片/附件 → 尝试下载 → 成功替换为本地路径，失败保留原链接
 *   5. 按 TOC 目录结构创建文件夹，文件以标题命名
 *   6. 生成 INDEX.md（目录树 + 文档列表）+ GRAPH.md（文档间引用关系）
 *   7. 输出导出报告
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { loadConfig } from "../common/config.js";
import {
  extractResources,
  downloadFile,
  formatFrontMatter,
  sanitizeFilename,
  htmlToMarkdown,
} from "../common/export-common.js";
import { buildTocDocDirMap } from "./export-toc.js";
import { buildIndexMd } from "./export-index.js";
import { buildGraphMd, extractYuqueLinks } from "./export-graph.js";

// ─── 主工具 ────────────────────────────────────────────

export const repoExport: McpTool = {
  name: "yuque_export_repo",
  description: "Export all docs in a repo as Markdown files organized by TOC dir structure, with images downloaded and INDEX.md+GRAPH.md generated. 详见 references/api/extended_api.md",

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

    // ── 2. 获取 TOC 目录树 ──
    const tocData = await apiGet(`/repos/${bookId}/toc`, undefined, "Export: get TOC");
    let tocNodes: Array<{ uuid: string; title: string; parent_uuid: string; child_uuid: string; doc_id?: number; type: string; url: string }> = [];
    if (!isErrorResult(tocData)) {
      tocNodes = ((tocData as { data?: typeof tocNodes }).data || []) as typeof tocNodes;
    }

    const docDirMap = buildTocDocDirMap(tocNodes);

    // ── 3. 分页获取全部文档 ──
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
            message: `知识库 "${bookSlug}" 没有文档`,
          }, null, 2),
        }],
      };
    }

    // ── 4. 创建输出目录 ──
    await mkdir(outputDir, { recursive: true });
    if (downloadImages) {
      await mkdir(imagesDir, { recursive: true });
      await mkdir(attachmentsDir, { recursive: true });
    }

    // ── 5. 逐个导出文档 ──
    const results = await exportDocs(
      allDocs,
      outputDir,
      imagesDir,
      attachmentsDir,
      downloadImages,
      rawBody,
      cfg.token,
      docDirMap,
    );

    // ── 6. 生成 INDEX.md 和 GRAPH.md ──
    const indexContent = buildIndexMd(tocNodes, results, repo.name || bookSlug);
    await writeFile(join(outputDir, "INDEX.md"), indexContent, "utf-8");

    const graphContent = buildGraphMd(results);
    await writeFile(join(outputDir, "GRAPH.md"), graphContent, "utf-8");

    // ── 7. 生成导出报告 ──
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
      index_file: join(outputDir, "INDEX.md"),
      graph_file: join(outputDir, "GRAPH.md"),
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

const EXPORT_CONCURRENCY = 5;

interface ExportResult {
  doc_id: number;
  slug: string;
  title: string;
  status: "ok" | "error";
  file: string;
  dir: string;
  images_downloaded: number;
  images_failed: number;
  error?: string;
  outboundLinks?: string[];
}

async function exportDocs(
  allDocs: Array<{ id: number; slug: string; title: string }>,
  outputDir: string,
  imagesDir: string,
  attachmentsDir: string,
  downloadImages: boolean,
  rawBody: boolean,
  token: string,
  docDirMap: Map<number, string>,
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];
  const total = allDocs.length;

  for (let i = 0; i < total; i += EXPORT_CONCURRENCY) {
    const batch = allDocs.slice(i, i + EXPORT_CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (docMeta) => {
        try {
          const docData = await apiGet(
            `/repos/docs/${docMeta.id}`,
            { page_size: "200", page: "1" },
            `Export: get doc ${docMeta.id}`,
          );

          if (isErrorResult(docData)) {
            return {
              doc_id: docMeta.id, slug: docMeta.slug, title: docMeta.title,
              status: "error" as const, file: "", dir: "", images_downloaded: 0, images_failed: 0,
              error: "Failed to fetch doc",
            };
          }

          return await exportSingleDoc(
            docData,
            docMeta,
            outputDir,
            imagesDir,
            attachmentsDir,
            downloadImages,
            rawBody,
            token,
            docDirMap.get(docMeta.id) || "",
          );
        } catch (err) {
          return {
            doc_id: docMeta.id, slug: docMeta.slug, title: docMeta.title,
            status: "error" as const, file: "", dir: "", images_downloaded: 0, images_failed: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );

    results.push(...batchResults);
    batchResults.length = 0;
  }

  return results;
}

async function exportSingleDoc(
  docData: unknown,
  docMeta: { id: number; slug: string; title: string },
  outputDir: string,
  imagesDir: string,
  attachmentsDir: string,
  downloadImages: boolean,
  rawBody: boolean,
  token: string,
  tocDir: string = "",
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

  const docDir = tocDir ? join(outputDir, tocDir) : outputDir;
  await mkdir(docDir, { recursive: true });

  const relDepth = tocDir ? tocDir.split("/").map(() => "..").join("/") + "/" : "";
  const relImagesDir = relDepth + "images";
  const relAttachmentsDir = relDepth + "attachments";

  let imagesDownloaded = 0;
  let imagesFailed = 0;

  let resourceMap = new Map<string, { url: string; localPath: string; success: boolean }>();

  if (downloadImages && bodyHtml) {
    const resources = extractResources(bodyHtml, imagesDir, attachmentsDir);

    for (const res of resources) {
      const destPath = join(outputDir, res.localPath);
      if (existsSync(destPath)) {
        resourceMap.set(res.url, { url: res.url, localPath: relDepth + res.localPath, success: true });
        continue;
      }
      const result = await downloadFile(res.url, destPath, token);
      resourceMap.set(res.url, {
        url: result.url,
        localPath: result.success ? relDepth + res.localPath : result.url,
        success: result.success,
      });
    }
  }

  let markdown = "";

  if (format === "markdown" && !rawBody) {
    markdown = body;
  } else if (bodyHtml && !rawBody) {
    markdown = htmlToMarkdown(bodyHtml);
  } else {
    markdown = body || JSON.stringify(doc, null, 2);
  }

  for (const [url, result] of resourceMap) {
    if (result.success) {
      imagesDownloaded++;
      markdown = markdown.replaceAll(url, result.localPath);
    } else {
      imagesFailed++;
    }
  }

  const outboundLinks = extractYuqueLinks(markdown);

  const frontmatter = formatFrontMatter({
    title, slug,
    created_at: createdAt, updated_at: updatedAt,
    word_count: wordCount, description,
  });

  const fileName = sanitizeFilename(title) + ".md";
  const filePath = join(docDir, fileName);
  await writeFile(filePath, frontmatter + markdown, "utf-8");

  return {
    doc_id: docMeta.id,
    slug,
    title,
    status: "ok",
    file: filePath,
    dir: tocDir,
    images_downloaded: imagesDownloaded,
    images_failed: imagesFailed,
    outboundLinks,
  };
}