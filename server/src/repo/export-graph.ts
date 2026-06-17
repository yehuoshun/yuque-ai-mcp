/**
 * repo/export-graph — GRAPH.md 引用关系图生成
 */

import { sanitizeFilename } from "../common/export-common.js";

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

export function buildGraphMd(results: ExportResult[]): string {
  const lines: string[] = [];
  lines.push("# 文档引用关系图");
  lines.push("");
  lines.push(`> 生成时间：${new Date().toISOString()}`);
  lines.push("");

  const slugToTitle = new Map<string, string>();
  const slugToFile = new Map<string, string>();
  for (const r of results) {
    if (r.status === "ok") {
      slugToTitle.set(r.slug, r.title);
      const filePath = (r.dir ? r.dir + "/" : "") + sanitizeFilename(r.title) + ".md";
      slugToFile.set(r.slug, filePath);
    }
  }

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

/**
 * 提取 Markdown 中的语雀文档链接
 */
export function extractYuqueLinks(markdown: string): string[] {
  const links: string[] = [];
  const regex = /https?:\/\/www\.yuque\.com\/[^/]+\/[^/]+\/([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  return links;
}