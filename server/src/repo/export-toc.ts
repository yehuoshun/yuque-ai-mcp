/**
 * repo/export-toc — TOC 树构建与目录映射
 */

import { join } from "node:path";
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

/**
 * 根据 TOC 树构建 doc_id → 相对目录路径 的映射
 */
export function buildTocDocDirMap(nodes: TocNode[]): Map<number, string> {
  const map = new Map<number, string>();

  if (!nodes || nodes.length === 0) return map;

  const nodeByUuid = new Map<string, TocNode>();
  for (const n of nodes) {
    nodeByUuid.set(n.uuid, n);
  }

  function getPath(uuid: string): string {
    const node = nodeByUuid.get(uuid);
    if (!node) return "";
    const parentPath = node.parent_uuid ? getPath(node.parent_uuid) : "";
    const dirName = sanitizeFilename(node.title);
    return parentPath ? join(parentPath, dirName) : dirName;
  }

  for (const n of nodes) {
    if (n.type === "DOC" && n.doc_id != null) {
      const dirPath = n.parent_uuid ? getPath(n.parent_uuid) : "";
      map.set(n.doc_id, dirPath);
    }
  }

  return map;
}