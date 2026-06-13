/**
 * doc/export-doc — 导出单篇文档为 Markdown
 *
 * 流程：
 *   1. 获取文档详情（body + body_html）
 *   2. 解析 body_html 中的图片/附件 → 尝试下载 → 成功替换为本地路径，失败保留原链接
 *   3. 输出 Markdown 文件 + 资源目录 + 导出报告
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
} from "./export-common.js";

export const docExportSingle: McpTool = {
  name: "yuque_export_doc",
  description:
    "Export a single document as Markdown with images/attachments downloaded. Failed downloads fall back to original CDN URLs.",

  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Document ID or slug (required)",
      },
      book_id: {
        type: "string",
        description: "Repository ID or namespace (recommended when using slug)",
      },
      output_dir: {
        type: "string",
        description: "Output directory path. Defaults to ./yuque-export/<doc_slug>/",
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
    required: ["id"],
  },

  async handler(args) {
    const cfg = loadConfig();
    const id = args?.id as string;
    const downloadImages = args?.download_images !== false;
    const rawBody = args?.raw_body === true;

    // ── 获取文档详情 ──
    const params: Record<string, string> = { page_size: "200", page: "1" };
    const docData = await apiGet(`/repos/docs/${id}`, params, "Export doc");
    if (isErrorResult(docData)) return docData;

    const doc = (docData as { data?: Record<string, unknown> }).data || {};
    const body = (doc.body as string) || "";
    const bodyHtml = (doc.body_html as string) || "";
    const format = (doc.format as string) || "markdown";
    const title = (doc.title as string) || "无标题";
    const slug = (doc.slug as string) || `doc_${id}`;
    const createdAt = (doc.created_at as string) || "";
    const updatedAt = (doc.updated_at as string) || "";
    const wordCount = (doc.word_count as number) || 0;
    const description = (doc.description as string) || "";

    const outputDir = (args?.output_dir as string) || `./yuque-export/${slug}`;
    const imagesDir = join(outputDir, "images");
    const attachmentsDir = join(outputDir, "attachments");

    // ── 创建输出目录 ──
    await mkdir(outputDir, { recursive: true });
    if (downloadImages) {
      await mkdir(imagesDir, { recursive: true });
      await mkdir(attachmentsDir, { recursive: true });
    }

    // ── 提取资源并下载 ──
    let resourceMap = new Map<string, { url: string; localPath: string; success: boolean; error?: string }>();
    let imagesDownloaded = 0;
    let imagesFailed = 0;

    if (downloadImages && bodyHtml) {
      const resources = extractResources(bodyHtml, imagesDir, attachmentsDir);

      for (const res of resources) {
        const destPath = join(outputDir, res.localPath);
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
      markdown = htmlToMarkdown(bodyHtml);
    } else {
      markdown = body || JSON.stringify(doc, null, 2);
    }

    // 替换图片引用为本地路径
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

    const report = {
      status: "done",
      doc: { id, slug, title, format },
      output_dir: outputDir,
      file: filePath,
      images_downloaded: imagesDownloaded,
      images_failed: imagesFailed,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
};