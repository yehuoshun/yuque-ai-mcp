import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { CreateIndexDocParams, DocEntry, ParsedIndexDoc } from "./types.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";

// 容量上限（语雀单库文档上限约 5000）
const REPO_DOC_LIMIT = 5000;
// 扩容阈值：到达此比例时提示需要新建子库
const REPO_CAPACITY_WARN_PCT = 90;
// 阻塞阈值：到达此比例时拒绝写入
const REPO_CAPACITY_BLOCK_PCT = 97;

// 语雀单篇文档 body 上限约 200KB，留 5KB 安全余量
const YUQUE_BODY_MAX = 195 * 1024;

/** 检查知识库容量，返回 { count, pct, level: ok|warn|block } */
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

/** 构建索引文档 body */
function buildIndexBody(keywords: string, searchSurface: string | undefined, summary: string, entries: DocEntry[]): string {
  const parts: string[] = [
    `关键词：${keywords}`,
  ];
  if (searchSurface) {
    parts.push(``, `搜索面：${searchSurface}`);
  }
  parts.push(
    ``,
    `摘要：${summary}`,
    ``,
    `entries：`,
    `\`\`\`json`,
    JSON.stringify(entries, null, 2),
    `\`\`\``,
  );
  return parts.join("\n");
}

/** body 模板开销（不含 entries JSON），用于估算单篇可容纳的 entry 数 */
function buildBodyOverhead(keywords: string, searchSurface: string | undefined, summary: string): string {
  const parts: string[] = [
    `关键词：${keywords}`,
  ];
  if (searchSurface) {
    parts.push(``, `搜索面：${searchSurface}`);
  }
  parts.push(
    ``,
    `摘要：${summary}`,
    ``,
    `entries：`,
    `\`\`\`json`,
    ``,
    `\`\`\``,
  );
  return parts.join("\n");
}

/** 将 entries 按 body 上限拆分为多批 */
function splitEntries(entries: DocEntry[], keywords: string, searchSurface: string | undefined, summary: string): DocEntry[][] {
  const overhead = Buffer.byteLength(buildBodyOverhead(keywords, searchSurface, summary), "utf-8");
  const batches: DocEntry[][] = [];
  let current: DocEntry[] = [];
  let currentSize = overhead;

  for (const entry of entries) {
    // 估算单个 entry 的大小（JSON.stringify 带缩进，最后一条不加逗号）
    const entryStr = JSON.stringify(entry, null, 2);
    // 如果不是第一条，前面要加换行分隔（数组内元素）
    const separator = current.length > 0 ? ",\n" : "";
    const entrySize = Buffer.byteLength(separator + entryStr, "utf-8");

    if (currentSize + entrySize > YUQUE_BODY_MAX && current.length > 0) {
      batches.push(current);
      current = [];
      currentSize = overhead;
    }
    current.push(entry);
    currentSize += entrySize;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * 创建关键词索引文档（v5 — 一对一精准锚点）
 *
 * 一个关键词 = 一篇源文档 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * entries 必须且只有 1 个。
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":9}]
 */
export async function createIndexDoc(params: CreateIndexDocParams): Promise<string> {
  const { keyword, keywords, search_surface, summary, entries, index_book_id, route_book_id } = params;

  if (!keyword) throw new Error("keyword 不能为空");
  if (!entries || entries.length === 0) throw new Error("entries 不能为空");

  const cleanKw = cleanToken(keyword);
  const cleanKeywords = cleanKeywordsArray(keywords);

  // 校验必填字段
  for (const e of entries) {
    if (!e.did) throw new Error("每个 entry 必须有 did");
    if (!e.ns) throw new Error("每个 entry 必须有 ns");
    if (!e.t) throw new Error("每个 entry 必须有 t（标题）");
    if (!e.s) throw new Error("每个 entry 必须有 s（slug）");
    if (e.w == null || e.w < 1 || e.w > 10) throw new Error("每个 entry 必须有 w（权重 1-10）");
  }

  // 为每个 entry 补 url（https://www.yuque.com/{ns}/{s}）
  const enrichedEntries = entries.map(e => ({
    ...e,
    url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
  }));

  const config = loadConfig();
  const { route_book, route_book_sub, default_book } = config;

  // 校验：传入的 index_book_id 必须匹配配置中的 route_book_sub
  if (index_book_id) {
    const matched = route_book_sub.some(b => String(b.book_id) === String(index_book_id));
    if (!matched) {
      const validIds = route_book_sub.map(b => `${b.book_id}（${b.namespace}）`).join(", ");
      return JSON.stringify({
        created: false,
        error: `index_book_id=${index_book_id} 不在配置的 route_book_sub 中`,
        valid_book_ids: route_book_sub.map(b => ({ book_id: b.book_id, namespace: b.namespace })),
        hint: `请使用配置中已有的子索引库：${validIds || "（无）"}。如需新建子索引库，先用 yuque_create_repo + yuque_config_update。`,
      });
    }
  }

  // 校验：传入的 route_book_id 必须匹配配置中的 route_book
  if (route_book_id) {
    const matched = route_book.some(b => String(b.book_id) === String(route_book_id));
    if (!matched) {
      const validIds = route_book.map(b => `${b.book_id}（${b.namespace}）`).join(", ");
      return JSON.stringify({
        created: false,
        error: `route_book_id=${route_book_id} 不在配置的 route_book 中`,
        valid_book_ids: route_book.map(b => ({ book_id: b.book_id, namespace: b.namespace })),
        hint: `请使用配置中已有的总库：${validIds || "（无）"}。如需新建总库，先用 yuque_create_repo + yuque_config_update。`,
      });
    }
  }

  const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
  if (!bookId) {
    return JSON.stringify({
      created: false,
      error: "route_book_sub 未配置",
      hint: "子索引库未配置。请先创建子索引库并写入 config 的 route_book_sub：\n1. yuque_create_repo → 创建 index-{domain}\n2. yuque_config_update → 追加 route_book_sub\n或通知 Agent 代为执行这两步。",
    });
  }

  // 容量检查
  const capacity = await checkRepoCapacity(bookId);
  if (capacity.level === "block") {
    return JSON.stringify({
      created: false,
      error: "capacity_blocked",
      current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
      hint: `子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线。需要新建子索引库：\n1. yuque_create_repo → 创建 index-{domain}-2\n2. yuque_config_update → 追加 route_book_sub\n3. 重新调本工具，传新的 index_book_id。`,
    });
  }
  const capacityWarning = capacity.level === "warn"
    ? `⚠️ 子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线，建议提前准备新子库。`
    : "";

  // 按 body 上限分片
  const batches = splitEntries(enrichedEntries, cleanKeywords, search_surface, summary);

  const createdDocs: { doc_id: number; title: string; slug: string; entries: number }[] = [];

  // 索引构建并发（默认 1，语雀 API 限流严格建议保守）
  const CONCURRENCY = config.index_concurrency || 1;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(async (batch, chunkIdx) => {
      const globalIdx = i + chunkIdx;
      const title = batches.length > 1 ? `${cleanKw}(${globalIdx + 1})` : cleanKw;
      const body = buildIndexBody(cleanKeywords, search_surface, summary, batch);

      const data = await post(`/repos/${bookId}/docs`, {
        title,
        body,
        format: "markdown",
      }) as any;
      const created = data.data || data;
      const docId = created.id as number;

      await put(`/repos/${bookId}/toc`, {
        action: "appendNode",
        action_mode: "child",
        target_uuid: "",
        type: "DOC",
        doc_ids: [docId],
      });

      return { doc_id: docId, title, slug: created.slug, entries: batch.length };
    }));
    createdDocs.push(...results);
  }

  const routeBookId = route_book_id;

  // 当传了 route_book_id 时，自动在总库创建路由文档（单文档粒度原子操作）
  // 路由标题=关键词，body=[{"did": <索引文档did>, "ns": "<子库ns>/<slug>"}]
  let routeSyncError = "";
  if (routeBookId && createdDocs.length > 0) {
    try {
      const subRepo = await get(`/repos/${bookId}`) as any;
      const subNs = subRepo.data?.namespace || subRepo.namespace || "";
      if (subNs) {
        for (const doc of createdDocs) {
          await post(`/repos/${route_book_id}/docs`, {
            title: doc.title,
            body: JSON.stringify([{ did: doc.doc_id, ns: `${subNs}/${doc.slug}` }]),
            format: "markdown",
          });
        }
        routeSyncError = "已同步";
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      routeSyncError = `路由同步失败: ${errMsg}`;
    }
  }

  return JSON.stringify({
    created: true,
    shards: batches.length,
    docs: createdDocs,
    keyword: cleanKw,
    total_entries: entries.length,
    book_id: bookId,
    route_sync: routeBookId ? routeSyncError : "未启用",
    ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
  }, null, 2);
}

/**
 * 解析索引文档 body → keywords / summary / entries
 */
export function parseIndexDoc(body: string): ParsedIndexDoc {
  if (!body) return { keywords: [], summary: "", entries: [], parse_error: "空 body" };

  const keywordsRaw = extractLine(body, "关键词：");
  const keywords = parseKeywords(keywordsRaw);
  const searchSurface = extractSection(body, "搜索面：", "摘要：") || undefined;
  const summary = extractSection(body, "摘要：", "entries：");

  // 新版格式：entries 在 ```json 代码块内
  const codeBlockMatch = body.match(/entries[：:]\s*\n```json\s*\n([\s\S]*?)\n```/);
  // 兼容旧版：entries 裸 JSON
  const oldMatch = body.match(/entries[：:]\s*\n?(\[[\s\S]*?\])\s*$/m);
  const entriesRaw = codeBlockMatch ? codeBlockMatch[1] : (oldMatch ? oldMatch[1] : "");

  const missing: string[] = [];
  if (!keywords || keywords.length === 0) missing.push("关键词");
  if (!entriesRaw) missing.push("entries");

  if (missing.length > 0) {
    return { keywords: keywords || [], summary: summary || "", entries: [], parse_error: `缺少字段: ${missing.join("/")}` };
  }

  let entries: DocEntry[] = [];
  try {
    const parsed = JSON.parse(entriesRaw);
    if (Array.isArray(parsed)) {
      entries = parsed.map((e: any) => ({
        did: e.did,
        ns: e.ns,
        t: e.t || "",
        s: e.s || "",
        url: e.url || `https://www.yuque.com/${e.ns}/${e.s}`,
        w: e.w ?? 5,
      }));
    }
  } catch {
    return { keywords, search_surface: searchSurface, summary, entries: [], parse_error: "entries JSON 解析失败" };
  }

  return { keywords, search_surface: searchSurface, summary, entries };
}