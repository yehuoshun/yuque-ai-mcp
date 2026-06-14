/**
 * copy-common — 跨知识库文档复制公共逻辑
 *
 * 职责：目录缓存与创建（TOC TITLE 节点）
 * 清洗由 Agent 负责，工具只做搬运
 */

import { apiPut, isErrorResult } from "../common/api-client.js";

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

// ─── 内容清洗 ──────────────────────────────────────────

/**
 * 清洗论坛剪藏垃圾文本
 *
 * 目前支持：LINUX DO
 * 后续可扩展：V2EX、Reddit 等
 */
export function cleanClipperNoise(body: string): string {
  let cleaned = body;

  // ── LINUX DO 剪藏特征 ──

  // 1. 开头的选择器："您已选择 **N** 个帖子。\n\n全选\n\n取消选择"
  cleaned = cleaned.replace(/您已选择\s*\*\*\d+\*\*\s*个帖子[\s\S]*?取消选择\n*/g, "");

  // 2. 浏览量统计行："915 浏览量 55 赞 29 用户"
  cleaned = cleaned.replace(/\d+\s*浏览量\s*\d+\s*赞\s*\d+\s*用户\n*/g, "");

  // 3. 头像列表区域：从 "[![](https://cdn.ldstatic.com" 开始到 "总结" 结束
  cleaned = cleaned.replace(/(?:\[!\[\]\(https:\/\/cdn\.ldstatic\.com[^)]+\)[^\n]*\n)+/g, "");

  // 4. "总结" 单行
  cleaned = cleaned.replace(/^总结\n/gm, "");

  // 5. "[以嵌套方式查看](/n/topic/...)"
  cleaned = cleaned.replace(/\[以嵌套方式查看\]\(\/n\/topic\/\d+\)\n*/g, "");

  // 6. 分页导航行
  cleaned = cleaned.replace(/\[\d+月\s*\d+\s*日\]\(\/t\/topic\/\d+[^)]*\)\n*/g, "");
  cleaned = cleaned.replace(/^\d+\s*\/\s*\d+\n/gm, "");
  cleaned = cleaned.replace(/^\d+月\s*\d+\s*日\n/gm, "");
  cleaned = cleaned.replace(/\[\d+\s*小时\]\(\/t\/topic\/\d+[^)]*\)\n*/g, "");

  // 7. "查看回复楼层"
  cleaned = cleaned.replace(/查看回复楼层\n*/g, "");

  // 8. 底部重复的 "由 xxx 于 xxx 前发布" 列表
  cleaned = cleaned.replace(/(?:^由\s+\S+\s+于\s+\d+\s*(?:天|小时)前\s*发布\n)+(?:-{3,}\n)?/gm, "");

  // 9. 提取正文主体：从 "#1" 开始到 "#2" 或第一个回复标记
  //    LINUX DO 剪藏中 #1 是楼主正文，#2+ 是回复
  const bodyStart = cleaned.match(/#1\b/);
  if (bodyStart && bodyStart.index !== undefined) {
    const afterHash1 = cleaned.substring(bodyStart.index);
    // 找 #2（下一个回复楼层）作为结束标记
    const replyStart = afterHash1.match(/\n#2\b/);
    if (replyStart && replyStart.index !== undefined) {
      cleaned = afterHash1.substring(0, replyStart.index);
    } else {
      cleaned = afterHash1;
    }
  }

  // 10. 清理 #1 之后、正文之前的残留（用户头像行、楼主标签等）
  //     匹配从 #1 之后到第一个 Markdown 标题（# 或 ##）之间的导航垃圾
  cleaned = cleaned.replace(/#1\n+/, "");
  // 删除 "楼主" 行、"[N 天](/t/topic/...)" 行、"跳到帖子" 行
  cleaned = cleaned.replace(/^楼主\n/gm, "");
  cleaned = cleaned.replace(/^\[跳到帖子\]\(\/t\/topic\/[^)]+\)\n/gm, "");
  // 残留的用户链接行："[用户名](/u/xxx)" 后面没有任何实质内容
  cleaned = cleaned.replace(/^\[[^\]]+\]\(\/u\/[^)]+\)[^\n]*\n/gm, "");
  // 残留的纯数字 + 括号行："6](/u/SudoTyper..."
  cleaned = cleaned.replace(/^\d+\]\(\/u\/[^)]+\)[^\n]*\n/gm, "");
  // 残留的 "[N 天](/t/topic/...)" 行
  cleaned = cleaned.replace(/^\[\d+\s*(?:天|小时)\]\(\/t\/topic\/[^)]+\)[^\n]*\n/gm, "");
  // 残留的 "N 个回复" 行
  cleaned = cleaned.replace(/^\d+\s*个回复\n/gm, "");
  // 残留的 "回复" 单行
  cleaned = cleaned.replace(/^回复\n/gm, "");

  // 11. 尾部清理：裁剪到 "---" 源链接之前（在 appendSourceLink 之前执行，
  //     所以这里清理的是正文末尾的论坛回复残留）
  //     找最后一个 "---" 之前的内容，如果后面只有少量垃圾就裁掉
  const lastSep = cleaned.lastIndexOf("\n---");
  if (lastSep > 0) {
    const afterSep = cleaned.substring(lastSep);
    // 如果分隔线后内容很短（<200字）且包含论坛特征，裁掉
    if (afterSep.length < 500 && /cdn\.ldstatic|\/u\/|\/t\/topic/.test(afterSep)) {
      cleaned = cleaned.substring(0, lastSep);
    }
  }

  // 10. 清理行首行尾空白 + 压缩过多空行
  cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");
  cleaned = cleaned.trim();

  return cleaned;
}

// ─── 目录创建 ────────────────────────────────────────────

/**
 * 确保目录路径在目标库 TOC 中存在，返回路径最末端节点的 UUID
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

    const tocData = await apiPut(`/repos/${bookId}/toc`, {}, "List TOC");
    const existingUuid = findTocNode(tocData, parts[i], parentUuid);
    if (existingUuid) {
      cache.set(subPath, { uuid: existingUuid, expiresAt: Date.now() + CACHE_TTL_MS });
      parentUuid = existingUuid;
      continue;
    }

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

// ─── 源链接追尾 ──────────────────────────────────────────

/** 在 body 末尾追加源文档链接（markdown 格式） */
export function appendSourceLink(
  body: string,
  sourceUrl: string,
  sourceTitle: string,
): string {
  const footer = `\n\n---\n> 📋 源文档：[${sourceTitle}](${sourceUrl})`;
  return body + footer;
}