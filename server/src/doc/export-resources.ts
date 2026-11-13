/**
 * doc/export-resources — 下载文档中的图片/附件到本地
 *
 * 职责：解析文档 body_html → 提取图片/附件 → 下载到指定目录 → 返回路径映射
 *
 * 独立于 yuque_export_doc，用户可按需调用。
 * Agent 编排示例：
 *   1. yuque_export_doc → 拿到 md 文件，图片是原始 URL
 *   2. yuque_export_resources → 下载所有资源到本地
 *   3. 替换 md 中的 URL 为本地路径
 *
 * 端点：GET /api/v2/repos/docs/:id（获取 body_html）
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { McpTool } from "../common/types.js";
import { apiGet, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { extractResources, downloadFile } from "../common/export-common.js";

export const docExportResources: McpTool = {
  name: "yuque_export_resources",
  description: "Download images/attachments from a document to local directory. Extracts resource URLs from body_html, downloads to <output_dir>/images/ and <output_dir>/attachments/, returns URL→local_path mapping. 详见 references/api/extended_api.md",

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
        description: "Output directory path (required). Resources saved to <output_dir>/images/ and <output_dir>/attachments/",
      },
    },
    required: ["id", "output_dir"],
  },

  async handler(args) {
    const cfg = loadConfig();

    // @validate
    const __v = check(
      requiredString(args?.id, "id"),
      requiredString(args?.output_dir, "output_dir"),
    );
    if (__v) return __v;

    const id = args?.id as string;
    const outputDir = args?.output_dir as string;

    // ── 获取文档详情 ──
    const params: Record<string, string> = { page_size: "200", page: "1" };
    const docData = await apiGet(`/repos/docs/${id}`, params, "Get doc for resources");
    if (isErrorResult(docData)) return docData;

    const doc = (docData as { data?: Record<string, unknown> }).data || {};
    const bodyHtml = (doc.body_html as string) || "";
    const title = (doc.title as string) || "无标题";

    if (!bodyHtml) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          status: "skipped",
          doc: { id, title },
          message: "文档无 body_html 内容，无需下载资源",
          output_dir: outputDir,
          resources: [],
          downloaded: 0,
          failed: 0,
        }, null, 2) }],
      };
    }

    // ── 创建输出目录 ──
    const imagesDir = join(outputDir, "images");
    const attachmentsDir = join(outputDir, "attachments");
    await mkdir(imagesDir, { recursive: true });
    await mkdir(attachmentsDir, { recursive: true });

    // ── 提取资源并下载 ──
    const resources = extractResources(bodyHtml);
    const mapping: Array<{ url: string; localPath: string; type: string; success: boolean; error?: string }> = [];
    let downloaded = 0;
    let failed = 0;

    for (const res of resources) {
      const destDir = res.type === "image" ? imagesDir : attachmentsDir;
      const destPath = join(destDir, res.localPath.split("/").pop() || "file");

      if (existsSync(destPath)) {
        mapping.push({ url: res.url, localPath: destPath, type: res.type, success: true });
        continue;
      }

      const result = await downloadFile(res.url, destPath, cfg.token);
      if (result.success) {
        downloaded++;
      } else {
        failed++;
      }
      mapping.push({ url: res.url, localPath: result.localPath, type: res.type, success: result.success, error: result.error });
    }

    const report = {
      status: "done",
      doc: { id, title },
      output_dir: outputDir,
      resources_total: resources.length,
      downloaded,
      failed,
      mapping,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(report, null, 2),
      }],
    };
  },
};
