import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { CreateIndexDocParams, DocEntry, ParsedIndexDoc } from "./types.js";
import { cleanToken } from "./utils.js";
import { listAllDocs } from "./search.js";

// 容量上限（语雀单库文档上限约 5000）
const REPO_DOC_LIMIT = 5000;
// 扩容阈值：到达此比例时提示需要新建子库
const REPO_CAPACITY_WARN_PCT = 90;
// 阻塞阈值：到达此比例时拒绝写入
const REPO_CAPACITY_BLOCK_PCT = 97;

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

/**
 * 创建关键词索引文档
 *
 * 一个关键词 = 一篇索引文档，标题即关键词。
 * body 为 JSON 数组，每项为一个 DocEntry。
 */
export async function createIndexDoc(params: CreateIndexDocParams): Promise<string> {
  const { keyword, entries, index_book_id, route_book_id } = params;

  if (!keyword) throw new Error("keyword 不能为空");
  if (!entries || entries.length === 0) throw new Error("entries 不能为空");

  const cleanKw = cleanToken(keyword);

  // 校验必填字段
  for (const e of entries) {
    if (!e.doc_id) throw new Error("每个 entry 必须有 doc_id");
    if (!e.namespace) throw new Error("每个 entry 必须有 namespace");
    if (!e.doc_title) throw new Error("每个 entry 必须有 doc_title（源文档标题）");
    if (!e.slug) throw new Error("每个 entry 必须有 slug");
    if (e.weight == null || e.weight < 1 || e.weight > 10) throw new Error("每个 entry 必须有 weight（权重 1-10）");
  }

  // 补全 url（写入时自动从 namespace + slug 拼接兜底）
  const enrichedEntries: DocEntry[] = entries.map(e => ({
    doc_id: e.doc_id,
    namespace: e.namespace,
    doc_title: e.doc_title,
    slug: e.slug,
    url: e.url || `https://www.yuque.com/${e.namespace}/${e.slug}`,
    weight: e.weight,
    title: e.title,
    keywords: e.keywords,
    search_surface: e.search_surface,
    summary: e.summary,
    tree: e.tree,
  }));

  // body = JSON 数组，agent 直接 JSON.parse
  const body = JSON.stringify(enrichedEntries, null, 2);

  const config = loadConfig();
  const { route_book, route_book_sub, default_book } = config;

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
      hint: "子索引库未配置。请先创建子索引库并写入 config 的 route_book_sub。",
    });
  }

  const capacity = await checkRepoCapacity(bookId);
  if (capacity.level === "block") {
    return JSON.stringify({
      created: false,
      error: "capacity_blocked",
      current_book: { book_id: bookId, count: capacity.count, pct: capacity.pct },
      hint: `子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_BLOCK_PCT}% 阻塞线，需要新建子索引库。`,
    });
  }
  const capacityWarning = capacity.level === "warn"
    ? `⚠️ 子索引库 ${capacity.label}，已超过 ${REPO_CAPACITY_WARN_PCT}% 预警线`
    : "";

  // 子库写入幂等：重试时已有同名文档则覆盖，不重复创建
  let docId: number;
  let isNew = false;
  const existingSubDoc = await findDocByTitle(bookId, cleanKw);
  if (existingSubDoc) {
    await put(`/repos/${bookId}/docs/${existingSubDoc.id}`, {
      title: cleanKw,
      body,
    });
    docId = existingSubDoc.id;
  } else {
    const data = await post(`/repos/${bookId}/docs`, {
      title: cleanKw,
      body,
      format: "markdown",
    }) as any;
    const created = data.data || data;
    docId = created.id as number;
    isNew = true;
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

  // 路由同步：子库写入成功后再写总库，失败则整体抛错让调用方重试
  if (route_book_id) {
    const subRepo = await get(`/repos/${bookId}`) as any;
    const subNs = subRepo.data?.namespace || subRepo.namespace || "";
    if (!subNs) {
      throw new Error(`无法获取子索引库 namespace（book_id=${bookId}），路由同步中断`);
    }
    // 总库路由文档幂等：先查后覆盖
    const existingRouteDoc = await findDocByTitle(route_book_id, cleanKw);
    if (existingRouteDoc) {
      await put(`/repos/${route_book_id}/docs/${existingRouteDoc.id}`, {
        title: cleanKw,
        body: JSON.stringify([{ book_id: Number(bookId), namespace: subNs }]),
      });
    } else {
      await post(`/repos/${route_book_id}/docs`, {
        title: cleanKw,
        body: JSON.stringify([{ book_id: Number(bookId), namespace: subNs }]),
        format: "markdown",
      });
    }
  }

  return JSON.stringify({
    created: isNew,
    updated: !isNew,
    doc_id: docId,
    keyword: cleanKw,
    total_entries: entries.length,
    book_id: bookId,
    route_sync: route_book_id ? "已同步" : "未启用",
    ...(capacityWarning ? { capacity_warning: capacityWarning } : {}),
  }, null, 2);
}

/** 按标题查找总库/子库中已存在的文档（用于路由同步幂等） */
async function findDocByTitle(bookId: number | string, title: string): Promise<{ id: number } | null> {
  const allDocs = await listAllDocs(bookId);
  const found = allDocs.find((d: any) => (d.title || "").trim() === title);
  return found ? { id: found.id } : null;
}

/**
 * 解析索引文档 body → entries
 *
 * body 格式：JSON 数组 [{doc_id, namespace, doc_title, slug, url, weight, ...}]
 */
export function parseIndexDoc(body: string): ParsedIndexDoc {
  if (!body) return { entries: [], parse_error: "空 body" };

  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      return { entries: [], parse_error: "body 不是 JSON 数组" };
    }

    const entries: DocEntry[] = parsed.map((e: any) => ({
      doc_id: e.doc_id || 0,
      namespace: e.namespace || "",
      doc_title: e.doc_title || "",
      slug: e.slug || "",
      url: e.url || (e.namespace && e.slug ? `https://www.yuque.com/${e.namespace}/${e.slug}` : ""),
      weight: e.weight ?? 5,
      title: e.title,
      keywords: e.keywords,
      search_surface: e.search_surface,
      summary: e.summary,
      tree: e.tree,
    }));

    return { entries };
  } catch (e) {
    return { entries: [], parse_error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
  }
}