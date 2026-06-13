/**
 * copy-common — 跨知识库文档复制公共逻辑
 *
 * 职责：content 清洗、目录缓存与创建（TOC TITLE 节点）
 * 分类由 Agent 判断，工具不调 LLM
 */

import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";

// ─── Content 清洗 ─────────────────────────────────────────

/** 清洗剪藏网页的垃圾标签，保留干净结构 */
export function sanitizeContent(html: string): string {
  let cleaned = html;

  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<[^>]*\bstyle\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  cleaned = cleaned.replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, "");
  cleaned = cleaned.replace(/<(div|span|p|li|td|th)\b[^>]*>\s*<\/(div|span|p|li|td|th)>/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/&nbsp;/g, " ");
  cleaned = cleaned.replace(/\s*(class|id)\s*=\s*["'][^"']*["']/gi, "");
  cleaned = cleaned.replace(/\s*data-[a-z0-9_-]+\s*=\s*["'][^"']*["']/gi, "");

  // 内容级清洗：剪藏论坛垃圾文本
  cleaned = cleaned.replace(/^您已选择 \*\*\d+\*\* 个帖子.?\s*/gm, "");
  cleaned = cleaned.replace(/^\d+ 浏览量.*$/gm, "");
  cleaned = cleaned.replace(/^\d+ 赞.*$/gm, "");
  cleaned = cleaned.replace(/^\d+ 用户$/gm, "");
  cleaned = cleaned.replace(/^全选\s*$/gm, "");
  cleaned = cleaned.replace(/^取消选择\s*$/gm, "");
  cleaned = cleaned.replace(/^总结\s*$/gm, "");
  cleaned = cleaned.replace(/^\[View as nested\].*$/gm, "");
  cleaned = cleaned.replace(/^查看回复楼层\s*$/gm, "");
  cleaned = cleaned.replace(/^\[.*?\]\(\/t\/topic\/\d+\/\d+.*?\)\s*$/gm, "");
  cleaned = cleaned.replace(/^\[.*?\]\(\/t\/topic\/\d+.*?\)\s*$/gm, "");
  cleaned = cleaned.replace(/^\d+ \/ \d+\s*$/gm, "");
  cleaned = cleaned.replace(/^由 .* 于 .* 发布\s*$/gm, "");
  cleaned = cleaned.replace(/^---+\s*$/gm, "");
  cleaned = cleaned.replace(/^楼主\s*$/gm, "");
  cleaned = cleaned.replace(/^\[\d+ 小时\].*$/gm, "");
  cleaned = cleaned.replace(/^\[.*?\]\(\/u\/\S+.*?\)\s*$/gm, "");
  cleaned = cleaned.replace(/^\d+月 \d+ 日\s*$/gm, "");
  cleaned = cleaned.replace(/^\d+ 小时\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\[!\]\(https:\/\/cdn\.ldstatic\.com\/.*?\)\s*$/gm, "");
  // LDStatic 头像 + 用户链接（论坛回复者头像行）
  cleaned = cleaned.replace(/^\s*\[!\]\(https:\/\/cdn\.ldstatic\.com\/.*?\)\[\/u\/\S+\].*$/gm, "");
  // 论坛 emoji 图片（纯装饰）
  cleaned = cleaned.replace(/^!\[\]\(https:\/\/cdn\.ldstatic\.com\/images\/emoji\/.*?\)\s*$/gm, "");
  // 残留的用户链接行（已被清洗掉头像但剩链接）
  cleaned = cleaned.replace(/^\s*\[\/u\/\S+\]\s*$/gm, "");
  // 残留的纯链接行
  cleaned = cleaned.replace(/^\s*\[.*?\]\(\/u\/\S+.*?\)\s*$/gm, "");

  return cleaned.trim();
}

// ─── 目录缓存（带 TTL） ──────────────────────────────────

interface CacheEntry {
  uuid: string;
  expiresAt: number;
}

interface DirCacheEntry {
  map: Map<string, CacheEntry>;
  timer: ReturnType<typeof setTimeout>;
}

/** 缓存 TTL：30 分钟 */
const CACHE_TTL_MS = 30 * 60 * 1000;

const dirCache = new Map<string, DirCacheEntry>();

function getCache(bookId: string): Map<string, CacheEntry> {
  let entry = dirCache.get(bookId);
  if (!entry) {
    const map = new Map<string, CacheEntry>();
    const timer = setTimeout(() => {
      dirCache.delete(bookId);
    }, CACHE_TTL_MS);
    if (timer && typeof timer === "object" && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    entry = { map, timer };
    dirCache.set(bookId, entry);
  }
  return entry.map;
}

function getCached(cache: Map<string, CacheEntry>, key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt > Date.now()) return entry.uuid;
  cache.delete(key);
  return null;
}

// ─── 目录创建 ────────────────────────────────────────────

/**
 * 确保目录路径在目标库 TOC 中存在，返回路径最末端节点的 UUID
 * 路径格式: "Java/Spring/SpringBoot"
 */
export async function ensureDirectoryPath(
  bookId: string,
  path: string,
): Promise<string | null> {
  const cache = getCache(bookId);
  const cached = getCached(cache, path);
  if (cached) return cached;

  const parts = path.split("/").filter(Boolean);
  let parentUuid = "";

  for (let i = 0; i < parts.length; i++) {
    const subPath = parts.slice(0, i + 1).join("/");
    const subCached = getCached(cache, subPath);
    if (subCached) {
      parentUuid = subCached;
      continue;
    }

    // 拉 TOC 树，查是否已有同名节点
    const tocData = await apiPut(`/repos/${bookId}/toc`, {}, "List TOC");
    const existingUuid = findTocNode(tocData, parts[i], parentUuid);
    if (existingUuid) {
      cache.set(subPath, { uuid: existingUuid, expiresAt: Date.now() + CACHE_TTL_MS });
      parentUuid = existingUuid;
      continue;
    }

    // 创建 TITLE 节点
    const createResult = await apiPut(`/repos/${bookId}/toc`, {
      action: "appendNode",
      action_mode: "child",
      type: "TITLE",
      title: parts[i],
      target_uuid: parentUuid,
    }, `Create TOC dir: ${subPath}`);

    if (isErrorResult(createResult)) return null;

    const newUuid = findTocNode(createResult, parts[i], parentUuid);
    if (!newUuid) return null;

    cache.set(subPath, { uuid: newUuid, expiresAt: Date.now() + CACHE_TTL_MS });
    parentUuid = newUuid;
  }

  return parentUuid;
}

// ─── TOC 节点查找 ────────────────────────────────────────

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

function extractTocNodes(data: unknown): Array<{
  uuid: string;
  title: string;
  type: string;
  parent_uuid: string | null;
}> {
  const nodes: Array<{
    uuid: string;
    title: string;
    type: string;
    parent_uuid: string | null;
  }> = [];
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