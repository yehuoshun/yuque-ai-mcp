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
import { join, relative, dirname } from "node:path";
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
} from "../common/export-common.js";

// ─── TOC 类型 ──────────────────────────────────────────

interface TocNode {
  uuid: string;
  title: string;
  parent_uuid: string;
  child_uuid: string;
  doc_id?: number;
  type: string;
  url: string;
}

// ─── 主工具 ────────────────────────────────────────────

export const repoExport: McpTool = {
  name: "yuque_export_repo",
  description:
    "Export all documents in a repository as Markdown files organized by TOC directory structure, " +
    "with images/attachments downloaded and INDEX.md + GRAPH.md generated. " +
    "Files are named by document title. Failed downloads fall back to original CDN URLs.",

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
    let tocNodes: TocNode[] = [];
    if (!isErrorResult(tocData)) {
      tocNodes = ((tocData as { data?: TocNode[] }).data || []) as TocNode[];
    }

    // 构建：doc_id → TOC 目录路径（相对于 outputDir）
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

// ─── TOC 目录映射 ──────────────────────────────────────

/**
 * 根据 TOC 树构建 doc_id → 相对目录路径 的映射
 *
 * TOC 节点有两种：
 * - type=TITLE: 目录节点，子节点在其下
 * - type=DOC: 文档节点，通过 doc_id 关联
 *
 * 使用 parent_uuid / child_uuid 链构建完整路径。
 */
function buildTocDocDirMap(nodes: TocNode[]): Map<number, string> {
  const map = new Map<number, string>();

  if (!nodes || nodes.length === 0) return map;

  // 先建立 uuid → node 和 uuid → parent_uuid 的索引
  const nodeByUuid = new Map<string, TocNode>();
  for (const n of nodes) {
    nodeByUuid.set(n.uuid, n);
  }

  // 递归计算某个 uuid 的目录路径
  function getPath(uuid: string): string {
    const node = nodeByUuid.get(uuid);
    if (!node) return "";

    // 从根往上递归
    const parentPath = node.parent_uuid ? getPath(node.parent_uuid) : "";
    const dirName = sanitizeFilename(node.title);

    return parentPath ? join(parentPath, dirName) : dirName;
  }

  // 遍历所有 DOC 类型的节点
  for (const n of nodes) {
    if (n.type === "DOC" && n.doc_id != null) {
      // DOC 节点的 parent_uuid 指向其所属的 TITLE 节点
      const dirPath = n.parent_uuid ? getPath(n.parent_uuid) : "";
      map.set(n.doc_id, dirPath);
    }
  }

  return map;
}

// ─── 批量导出实现 ─────────────────────────────────────

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
  outboundLinks?: string[];  // 引用其他文档的链接
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
          status: "error", file: "", dir: "", images_downloaded: 0, images_failed: 0,
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
        docDirMap.get(docMeta.id) || "",
      );
      results.push(result);
    } catch (err) {
      results.push({
        doc_id: docMeta.id, slug: docMeta.slug, title: docMeta.title,
        status: "error", file: "", dir: "", images_downloaded: 0, images_failed: 0,
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

  // 根据 TOC 确定文档所在目录
  const docDir = tocDir ? join(outputDir, tocDir) : outputDir;
  await mkdir(docDir, { recursive: true });

  // 相对 images/attachments 目录（用于 Markdown 引用）
  const relDepth = tocDir ? tocDir.split("/").map(() => "..").join("/") + "/" : "";
  const relImagesDir = relDepth + "images";
  const relAttachmentsDir = relDepth + "attachments";

  let imagesDownloaded = 0;
  let imagesFailed = 0;

  // 提取资源并下载
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

  // 生成 Markdown 内容
  let markdown = "";

  if (format === "markdown" && !rawBody) {
    markdown = body;
  } else if (bodyHtml && !rawBody) {
    markdown = htmlToMarkdown(bodyHtml);
  } else {
    markdown = body || JSON.stringify(doc, null, 2);
  }

  // 替换图片引用（使用相对路径）
  for (const [url, result] of resourceMap) {
    if (result.success) {
      imagesDownloaded++;
      markdown = markdown.replaceAll(url, result.localPath);
    } else {
      imagesFailed++;
    }
  }

  // 提取文档中的语雀链接（用于 GRAPH.md）
  const outboundLinks = extractYuqueLinks(markdown);

  // 添加 frontmatter
  const frontmatter = formatFrontMatter({
    title, slug,
    created_at: createdAt, updated_at: updatedAt,
    word_count: wordCount, description,
  });

  // 文件名 = 标题（安全化处理）
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

// ─── INDEX.md 生成 ─────────────────────────────────────

function buildIndexMd(
  tocNodes: TocNode[],
  results: ExportResult[],
  repoName: string,
): string {
  const lines: string[] = [];
  lines.push(`# ${repoName} — 导出索引`);
  lines.push("");
  lines.push(`> 导出时间：${new Date().toISOString()}`);
  lines.push(`> 文档总数：${results.length}（成功 ${results.filter(r => r.status === "ok").length}，失败 ${results.filter(r => r.status === "error").length}）`);
  lines.push("");

  // 按 TOC 树输出目录结构
  if (tocNodes.length > 0) {
    lines.push("## 目录结构");
    lines.push("");
    lines.push(formatTocTree(tocNodes, results));
  } else {
    // 无 TOC 时平铺列表
    lines.push("## 文档列表");
    lines.push("");
    lines.push("| 标题 | Slug | 状态 |");
    lines.push("|------|------|------|");
    for (const r of results) {
      const status = r.status === "ok" ? "✅" : `❌ ${r.error || ""}`;
      const file = r.status === "ok" ? `[${r.title}](${r.dir ? r.dir + "/" : ""}${sanitizeFilename(r.title)}.md)` : r.title;
      lines.push(`| ${file} | ${r.slug} | ${status} |`);
    }
  }

  return lines.join("\n");
}

/**
 * 将 TOC 扁平数组格式化为 Markdown 目录树
 */
function formatTocTree(nodes: TocNode[], results: ExportResult[]): string {
  // 建立 uuid → node 索引
  const nodeByUuid = new Map<string, TocNode>();
  for (const n of nodes) {
    nodeByUuid.set(n.uuid, n);
  }

  // 建立 parent_uuid → children 索引
  const childrenByParent = new Map<string, TocNode[]>();
  for (const n of nodes) {
    const parentKey = n.parent_uuid || "__root__";
    const arr = childrenByParent.get(parentKey) || [];
    arr.push(n);
    childrenByParent.set(parentKey, arr);
  }

  // 找到根节点（没有 parent_uuid 或 parent_uuid 为空的 TITLE 节点）
  const rootChildren = childrenByParent.get("__root__") || [];

  // 建立 slug → title 映射用于链接解析
  const resultByDir = new Map<string, ExportResult>();
  for (const r of results) {
    if (r.status === "ok") {
      const key = r.dir || "";
      resultByDir.set(key + ":::" + r.title, r);
    }
  }

  const lines: string[] = [];

  function renderNode(node: TocNode, depth: number) {
    const indent = "  ".repeat(depth);
    if (node.type === "TITLE") {
      lines.push(`${indent}- 📁 **${node.title}**`);
      const children = childrenByParent.get(node.uuid) || [];
      for (const child of children) {
        renderNode(child, depth + 1);
      }
    } else if (node.type === "DOC" && node.doc_id != null) {
      // 找到对应的导出结果
      const result = results.find(r => r.doc_id === node.doc_id);
      if (result && result.status === "ok") {
        const filePath = (result.dir ? result.dir + "/" : "") + sanitizeFilename(result.title) + ".md";
        lines.push(`${indent}- 📄 [${result.title}](${filePath})`);
      } else {
        lines.push(`${indent}- 📄 ${node.title} ${!result ? "(未找到)" : "(导出失败)"}`);
      }
    } else {
      lines.push(`${indent}- ${node.title}`);
    }
  }

  for (const child of rootChildren) {
    renderNode(child, 0);
  }

  return lines.join("\n");
}

// ─── GRAPH.md 生成 ─────────────────────────────────────

/**
 * 提取 Markdown 中的语雀文档链接
 * 匹配 https://www.yuque.com/<user>/<book>/<slug> 格式
 */
function extractYuqueLinks(markdown: string): string[] {
  const links: string[] = [];
  const regex = /https?:\/\/www\.yuque\.com\/[^/]+\/[^/]+\/([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    // 去重
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  return links;
}

function buildGraphMd(results: ExportResult[]): string {
  const lines: string[] = [];
  lines.push("# 文档引用关系图");
  lines.push("");
  lines.push(`> 生成时间：${new Date().toISOString()}`);
  lines.push("");

  // 建立 slug → title 索引
  const slugToTitle = new Map<string, string>();
  const slugToFile = new Map<string, string>();
  for (const r of results) {
    if (r.status === "ok") {
      slugToTitle.set(r.slug, r.title);
      const filePath = (r.dir ? r.dir + "/" : "") + sanitizeFilename(r.title) + ".md";
      slugToFile.set(r.slug, filePath);
    }
  }

  // 统计引用关系
  let totalOutbound = 0;
  let totalUnresolved = 0;
  const okResults = results.filter(r => r.status === "ok");

  if (okResults.length === 0) {
    lines.push("（无成功导出的文档）");
    return lines.join("\n");
  }

  lines.push("## 引用关系");
  lines.push("");

  for (const r of okResults) {
    const links = r.outboundLinks || [];
    if (links.length === 0) continue;

    totalOutbound += links.length;
    const fromFile = (r.dir ? r.dir + "/" : "") + sanitizeFilename(r.title) + ".md";

    for (const targetSlug of links) {
      const targetTitle = slugToTitle.get(targetSlug);
      const targetFile = slugToFile.get(targetSlug);

      if (targetTitle) {
        lines.push(`- [${r.title}](${fromFile}) → [${targetTitle}](${targetFile})`);
      } else {
        totalUnresolved++;
        lines.push(`- [${r.title}](${fromFile}) → \`${targetSlug}\` ⚠️ 未在本知识库中找到`);
      }
    }
  }

  if (totalOutbound === 0) {
    lines.push("（未检测到文档间引用）");
  }

  lines.push("");
  lines.push("## 统计");
  lines.push("");
  lines.push(`- 总引用数：${totalOutbound}`);
  lines.push(`- 已解析：${totalOutbound - totalUnresolved}`);
  lines.push(`- 未解析：${totalUnresolved}`);
  lines.push(`- 有引用的文档：${okResults.filter(r => (r.outboundLinks || []).length > 0).length} / ${okResults.length}`);

  return lines.join("\n");
}