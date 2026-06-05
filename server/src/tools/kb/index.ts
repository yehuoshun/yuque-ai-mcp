import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { CreateIndexDocParams, DocEntry, ParsedIndexDoc } from "./types.js";
import { cleanToken } from "./utils.js";
import { listAllDocs } from "./search.js";

const REPO_DOC_LIMIT = 5000;
const REPO_CAPACITY_WARN_PCT = 90;
const REPO_CAPACITY_BLOCK_PCT = 97;

async function checkRepoCapacity(bookId: number | string): Promise<{ count: number; pct: number; level: "ok" | "warn" | "block"; label: string }> {
  try {
    const data = await get(`/repos/${bookId}`) as any;
    const repo = data.data || data;
    const count = repo.items_count || 0;
    const pct = Math.round((count / REPO_DOC_LIMIT) * 1000) / 10;
    const name = repo.name || String(bookId);
    if (count >= REPO_DOC_LIMIT * (REPO_CAPACITY_BLOCK_PCT / 100)) {
      return { count, pct, level: "block", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
    }
    if (count >= REPO_DOC_LIMIT * (REPO_CAPACITY_WARN_PCT / 100)) {
      return { count, pct, level: "warn", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
    }
    return { count, pct, level: "ok", label: `${name}（${count}/${REPO_DOC_LIMIT}, ${pct}%）` };
  } catch {
    return { count: 0, pct: 0, level: "ok", label: String(bookId) };
  }
}

/**
 * 将 DocEntry[] 序列化为 Markdown body
 *
 * 格式（每个 entry 一块）：
 *   # {doc_title}
 *
 *   ## 搜索面
 *   {search_surface}
 *
 *   ### 摘要
 *   {summary}
 *
 *   - doc_id: {doc_id}
 *   - 链接: {url}
 *   - 权重: {weight}
 */
function entriesToMarkdown(entries: DocEntry[]): string {
  const blocks = entries.map(e => {
    const title = e.doc_title || "";
    const surface = (e.search_surface || "").trim();
    const summary = (e.summary || "").trim();
    const url = e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`;

    const lines: string[] = [];
    lines.push(`# ${title}`);
    if (e.keywords && e.keywords.length > 0) {
      lines.push("");
      lines.push("## 关键词");
      for (const kw of e.keywords) {
        lines.push(kw);
      }
    }
    if (surface) {
      lines.push("");
      lines.push("## 搜索面");
      lines.push(surface);
    }
    if (summary) {
      lines.push("");
      lines.push("## 摘要");
      lines.push(summary);
    }
    lines.push("");
    lines.push("## doc_id");
    lines.push(String(e.doc_id));
    lines.push("## 链接");
    lines.push(url);
    lines.push("## 权重");
    lines.push(String(e.weight));
    return lines.join("\n");
  });

  return blocks.join("\n\n") + "\n";
}

/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 Markdown 格式：每个源文档一个块（标题 + 搜索面 + 摘要 + 元数据）。
 */
export async function createIndexDoc(params: CreateIndexDocParams): Promise<string> {
  const { keyword, entries, index_book_id } = params;

  if (!keyword) throw new Error("keyword 不能为空");
  if (!entries || entries.length === 0) throw new Error("entries 不能为空");

  const cleanKw = cleanToken(keyword);

  for (const e of entries) {
    if (!e.doc_id) throw new Error("每个 entry 必须有 doc_id");
    if (!e.namespace) throw new Error("每个 entry 必须有 namespace");
    if (!e.doc_title) throw new Error("每个 entry 必须有 doc_title");
    if (!e.slug) throw new Error("每个 entry 必须有 slug");
    if (e.weight == null || e.weight < 1 || e.weight > 10) throw new Error("每个 entry 必须有 weight（权重 1-10）");
  }

  const enrichedEntries: DocEntry[] = entries.map(e => ({
    doc_id: e.doc_id,
    namespace: e.namespace,
    doc_title: e.doc_title,
    slug: e.slug,
    url: e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`,
    weight: e.weight,
    keywords: e.keywords,
    search_surface: e.search_surface,
    summary: e.summary,
    tree: e.tree,
  }));

  const body = entriesToMarkdown(enrichedEntries);

  const MAX_BODY_BYTES = 200 * 1024;
  const bodyBytes = Buffer.byteLength(body, "utf-8");
  if (bodyBytes > MAX_BODY_BYTES) {
    return JSON.stringify({
      created: false,
      error: "body_too_large",
      body_bytes: bodyBytes,
      limit_bytes: MAX_BODY_BYTES,
      entry_count: enrichedEntries.length,
      hint: `索引文档 body ${(bodyBytes / 1024).toFixed(1)}KB 超过 ${MAX_BODY_BYTES / 1024}KB 上限。建议拆分关键词或减少低权重 entry。`,
    }, null, 2);
  }

  const config = loadConfig();
  const { route_book_sub, default_book } = config;

  if (index_book_id) {
    const matched = route_book_sub.some(b => String(b.book_id) === String(index_book_id));
    if (!matched) {
      const validIds = route_book_sub.map(b => `${b.book_id}（${b.namespace}）`).join(", ");
      return JSON.stringify({
        created: false,
        error: `index_book_id=${index_book_id} 不在配置的 route_book_sub 中`,
        valid_book_ids: route_book_sub.map(b => ({ book_id: b.book_id, namespace: b.namespace })),
        hint: `请使用配置中已有的子索引库：${validIds || "（无）"}。`,
      });
    }
  }

  const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
  if (!bookId) {
    return JSON.stringify({
      created: false,
      error: "route_book_sub 未配置",
      hint: "子索引库未配置。",
    });
  }

  const capacity = await checkRepoCapacity(bookId);
  if (capacity.level === "block") {
    return JSON.stringify({
      created: false,
      error: "capacity_blocked",
      current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
      hint: `子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线。`,
    });
  }
  const capacityWarning = capacity.level === "warn"
    ? `⚠️ 子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线`
    : "";

  let docId: number;
  let docSlug: string;
  let isNew = false;
  const existingSubDoc = await findDocByTitle(bookId, cleanKw);
  if (existingSubDoc) {
    const putResult = await put(`/repos/${bookId}/docs/${existingSubDoc.id}`, {
      title: cleanKw,
      body,
    }) as any;
    docId = existingSubDoc.id;
    docSlug = (putResult.data || putResult).slug || existingSubDoc.slug || "";
  } else {
    const data = await post(`/repos/${bookId}/docs`, {
      title: cleanKw,
      body,
      format: "markdown",
    }) as any;
    const created = data.data || data;
    docId = created.id as number;
    docSlug = created.slug || "";
    isNew = true;
    if (docSlug) titleCache.set(`${bookId}:${cleanKw}`, { id: docId, slug: docSlug, ts: Date.now() });
  }

  if (!docSlug) {
    throw new Error(`无法获取索引文档 slug（doc_id=${docId}），创建中断`);
  }

  if (isNew) {
    await put(`/repos/${bookId}/toc`, {
      action: "appendNode",
      action_mode: "child",
      target_uuid: "",
      type: "DOC",
      doc_ids: [docId],
    });
  }

  return JSON.stringify({
    created: isNew,
    updated: !isNew,
    doc_id: docId,
    keyword: cleanKw,
    total_entries: entries.length,
    book_id: bookId,
    ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
  }, null, 2);
}

// ─── 标题缓存 ─────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  id: number;
  slug: string;
  ts: number;
}

export const titleCache = new Map<string, CacheEntry>();

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of titleCache) {
    if (now - entry.ts > CACHE_TTL_MS) titleCache.delete(key);
  }
}

export async function findDocByTitle(bookId: number | string, title: string): Promise<{ id: number; slug: string } | null> {
  pruneCache();
  const cacheKey = `${bookId}:${title}`;
  const cached = titleCache.get(cacheKey);
  if (cached) return { id: cached.id, slug: cached.slug };

  const allDocs = await listAllDocs(bookId);
  const now = Date.now();
  for (const d of allDocs) {
    const t = (d.title || "").trim();
    if (t) titleCache.set(`${bookId}:${t}`, { id: d.id, slug: d.slug || "", ts: now });
  }
  const fresh = titleCache.get(cacheKey);
  return fresh ? { id: fresh.id, slug: fresh.slug } : null;
}

// ─── 解析 ─────────────────────────────────────────────

/**
 * 解析索引文档 Markdown body → ParsedIndexDoc
 *
 * body 格式（每个 entry 一个 # 块）：
 *   # {doc_title}
 *
 *   ## 搜索面
 *   {search_surface}
 *
 *   ## 摘要
 *   {summary}
 *
 *   ## doc_id
 *   {doc_id}
 *   ## 链接
 *   {url}
 *   ## 权重
 *   {weight}
 */
export function parseIndexDoc(body: string): ParsedIndexDoc {
  if (!body) return { entries: [], parse_error: "空 body" };

  // 按 `\n# ` 分割各块
  const blocks = body.split(/\n(?=# )/).filter(b => b.trim());
  if (blocks.length === 0) {
    return { entries: [], parse_error: "未找到有效块" };
  }

  const entries: DocEntry[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const entry = parseBlock(trimmed);
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return { entries: [], parse_error: "所有块解析失败" };
  }

  return { entries };
}

/** 解析单个块 → DocEntry */
function parseBlock(block: string): DocEntry | null {
  const lines = block.split("\n");

  // 第一行是 # {doc_title}
  const titleLine = lines[0]?.trim();
  const docTitle = titleLine?.startsWith("# ") ? titleLine.substring(2).trim() : "";

  // 提取 关键词、doc_id、链接、权重
  let docId = 0;
  let url = "";
  let weight = 5;
  const keywords: string[] = [];
  let inKeywords = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "## 关键词") {
      inKeywords = true;
      continue;
    }
    if (inKeywords && (trimmed.startsWith("## ") || trimmed === "")) {
      inKeywords = false;
    }
    if (inKeywords && trimmed) {
      keywords.push(trimmed);
      continue;
    }
    if (trimmed === "## doc_id") {
      docId = parseInt((lines[i + 1] || "").trim(), 10);
    } else if (trimmed === "## 链接") {
      url = (lines[i + 1] || "").trim();
    } else if (trimmed === "## 权重") {
      weight = parseInt((lines[i + 1] || "").trim(), 10);
    }
  }

  if (!docId || !url) return null;

  // 从 URL 提取 namespace 和 slug
  const urlMatch = url.match(/yuque\.com\/(.+?)\/(.+?)\/([^/?#]+)/);
  const namespace = urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : "";
  const slug = urlMatch ? urlMatch[3] : "";

  // 搜索面和摘要 = 标题行之后、## doc_id 之前的文本
  const contentLines: string[] = [];
  let inContent = false;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "## doc_id") break;
    if (trimmed && !inContent) inContent = true;
    if (inContent) contentLines.push(trimmed);
  }

  return {
    doc_id: docId,
    namespace,
    doc_title: docTitle,
    slug,
    url,
    weight,
    keywords: keywords.length > 0 ? keywords : undefined,
  };
}