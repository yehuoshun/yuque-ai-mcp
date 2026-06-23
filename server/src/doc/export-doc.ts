/**
 * doc/export-doc — 导出单篇文档为 Markdown 文件
 *
 * 职责：取文档 → 转 Markdown → 加 frontmatter → 写磁盘
 * 资源下载已拆到 yuque_export_resources，本工具不负责。
 *
 * 端点：GET /api/v2/repos/docs/:id（复用 yuque_get_doc）
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";
import {
  formatFrontMatter,
  sanitizeFilename,
  htmlToMarkdown,
} from "../common/export-common.js";

export const docExportSingle: McpTool = {
  name: "yuque_export_doc",
  description: "Export a single document as Markdown file. Fetches doc → converts body_html to Markdown → adds frontmatter → writes to disk. Resource download is separate (yuque_export_resources). 详见 references/api/extended_api.md",

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
        description: "Output directory path (required). The file will be saved as <output_dir>/<title>.md",
      },
      raw_body: {
        type: "boolean",
        description: "Use raw body field instead of converting body_html to markdown (default false). Useful for markdown-format docs.",
      },
    },
    required: ["id", "output_dir"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.id, "id"),
      requiredString(args?.output_dir, "output_dir"),
    );
    if (__v) return __v;

    const id = args?.id as string;
    const outputDir = args?.output_dir as string;
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

    // ── 创建输出目录 ──
    await mkdir(outputDir, { recursive: true });

    // ── 生成 Markdown 内容 ──
    let markdown = "";

    if (format === "markdown" && !rawBody) {
      markdown = body;
    } else if (bodyHtml && !rawBody) {
      markdown = htmlToMarkdown(bodyHtml);
    } else {
      markdown = body || JSON.stringify(doc, null, 2);
    }

    // 添加 frontmatter
    const frontmatter = formatFrontMatter({
      title, slug,
      created_at: createdAt, updated_at: updatedAt,
      word_count: wordCount, description,
    });

    const fileName = sanitizeFilename(title) + ".md";
    const filePath = join(outputDir, fileName);
    await writeFile(filePath, frontmatter + markdown, "utf-8");

    const report = {
      status: "done",
      doc: { id, slug, title, format },
      output_dir: outputDir,
      file: filePath,
      word_count: wordCount,
      note: "图片/附件引用保留原始 URL。如需下载资源，请调用 yuque_export_resources",
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
};
