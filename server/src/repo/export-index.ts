/**
 * repo/export-index — INDEX.md 生成
 */

import { sanitizeFilename } from "../common/export-common.js";

interface TocNode {
  uuid: string;
  title: string;
  parent_uuid: string;
  child_uuid: string;
  doc_id?: number;
  type: string;
  url: string;
}

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

export function buildIndexMd(
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

  if (tocNodes.length > 0) {
    lines.push("## 目录结构");
    lines.push("");
    lines.push(formatTocTree(tocNodes, results));
  } else {
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

function formatTocTree(nodes: TocNode[], results: ExportResult[]): string {
  const nodeByUuid = new Map<string, TocNode>();
  for (const n of nodes) {
    nodeByUuid.set(n.uuid, n);
  }

  const childrenByParent = new Map<string, TocNode[]>();
  for (const n of nodes) {
    const parentKey = n.parent_uuid || "__root__";
    const arr = childrenByParent.get(parentKey) || [];
    arr.push(n);
    childrenByParent.set(parentKey, arr);
  }

  const rootChildren = childrenByParent.get("__root__") || [];
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