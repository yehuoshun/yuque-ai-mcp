/**
 * copy-common — 跨知识库文档复制公共逻辑
 *
 * 职责：content 清洗、目录缓存与创建
 * 分类由 Agent 判断，工具不调 LLM
 */

import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";

// ─── Content 清洗 ─────────────────────────────────────────

/** 清洗剪藏网页的垃圾标签，保留干净结构 */
export function sanitizeContent(html: string): string {
  let cleaned = html;

  // 移除 style 标签
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // 移除 script 标签
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // 移除隐藏元素
  cleaned = cleaned.replace(/<[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  cleaned = cleaned.replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, "");

  // 移除空标签（不含文本和子元素的 div/span/p）
  cleaned = cleaned.replace(/<(div|span|p|li|td|th)\b[^>]*>\s*<\/(div|span|p|li|td|th)>/gi, "");

  // 移除多余空白
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/&nbsp;/g, " ");

  // 移除常见剪藏垃圾 class/id
  cleaned = cleaned.replace(/\s*(class|id)\s*=\s*["'][^"']*["']/gi, "");

  // 移除 data-* 属性
  cleaned = cleaned.replace(/\s*data-[a-z0-9_-]+\s*=\s*["'][^"']*["']/gi, "");

  return cleaned.trim();
}

// ─── 目录缓存 ────────────────────────────────────────────

/** 目录路径 → TOC 节点 UUID */
export interface DirCache {
  [bookId: string]: Map<string, string>;
}

const dirCache: DirCache = {};

function getCache(bookId: string): Map<string, string> {
  if (!dirCache[bookId]) {
    dirCache[bookId] = new Map();
  }
  return dirCache[bookId];
}

/**
 * 确保目录路径在目标库中存在，返回路径最末端节点的 UUID
 * 路径格式: "Java/Spring/SpringBoot"
 * 用 TOC API 创建层级目录（TITLE 节点），通过拉 TOC 树定位节点 uuid
 */
export async function ensureDirectoryPath(
  bookId: string,
  path: string,
): Promise<string | null> {
  const cache = getCache(bookId);
  if (cache.has(path)) {
    return String(cache.get(path)!);
  }

  const parts = path.split("/").filter(Boolean);
  let parentUuid = ""; // 空 = 根节点

  for (let i = 0; i < parts.length; i++) {
    const subPath = parts.slice(0, i + 1).join("/");
    if (cache.has(subPath)) {
      parentUuid = String(cache.get(subPath)!);
      continue;
    }

    // 1. 拉当前 TOC 树，查是否已有同名节点
    const tocData = await apiPut(`/repos/${bookId}/toc`, {}, "List TOC");
    // 实际 GET 拿 TOC
    const existingUuid = findTocNode(tocData, parts[i], parentUuid);
    if (existingUuid) {
      cache.set(subPath, existingUuid);
      parentUuid = existingUuid;
      continue;
    }

    // 2. 创建 TITLE 节点
    const createPayload: Record<string, unknown> = {
      action: "appendNode",
      action_mode: "child",
      type: "TITLE",
      title: parts[i],
      target_uuid: parentUuid,
    };

    const createResult = await apiPut(`/repos/${bookId}/toc`, createPayload, `Create TOC dir: ${subPath}`);
    if (isErrorResult(createResult)) {
      return null;
    }

    // 3. 从返回的 TOC 树中找新节点 uuid
    const newUuid = findTocNode(createResult, parts[i], parentUuid);
    if (!newUuid) {
      return null;
    }

    cache.set(subPath, newUuid);
    parentUuid = newUuid;
  }

  return parentUuid;
}

/** 在 TOC 树中查找指定 title + parent_uuid 的节点 */
function findTocNode(
  data: unknown,
  title: string,
  parentUuid: string,
): string | null {
  const nodes = extractTocNodes(data);
  for (const node of nodes) {
    if (
      node.title === title &&
      (node.parent_uuid || "") === parentUuid &&
      node.type === "TITLE"
    ) {
      return node.uuid;
    }
  }
  return null;
}

/** 从 API 响应中提取 TOC 节点数组 */
function extractTocNodes(data: unknown): Array<{ uuid: string; title: string; type: string; parent_uuid: string | null }> {
  const nodes: Array<{ uuid: string; title: string; type: string; parent_uuid: string | null }> = [];
  const items = (data as { data?: unknown[] })?.data;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item && typeof item === "object") {
        const node = item as Record<string, unknown>;
        nodes.push({
          uuid: String(node.uuid || ""),
          title: String(node.title || ""),
          type: String(node.type || ""),
          parent_uuid: (node.parent_uuid as string) || null,
        });
      }
    }
  }
  return nodes;
}