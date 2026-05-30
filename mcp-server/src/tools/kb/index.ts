import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { CreateIndexDocParams, DocEntry, ParsedIndexDoc } from "./types.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";

// 容量上限（语雀单库文档上限约 5000，远远大于索引规模，此检查仅兜底）
const REPO_DOC_LIMIT = 5000;

// 语雀单篇文档 body 上限约 200KB，留 5KB 安全余量
const YUQUE_BODY_MAX = 195 * 1024;

/** 静默检查知识库容量，仅超限时警告（几乎不会触发） */
async function checkRepoCapacity(bookId: number | string, label: string): Promise<string> {
  try {
    const data = await get(`/repos/${bookId}`) as any;
    const repo = data.data || data;
    const count = repo.items_count || 0;
    if (count >= REPO_DOC_LIMIT * 0.95) {
      return `⚠️ ${label}（${repo.name || bookId}）已有 ${count} 篇文档，接近语雀上限（${REPO_DOC_LIMIT}），请手动处理。`;
    }
  } catch {}
  return "";
}

/** 构建索引文档 body */
function buildIndexBody(keywords: string, summary: string, entries: DocEntry[]): string {
  return [
    `关键词：${keywords}`,
    ``,
    `摘要：${summary}`,
    ``,
    `entries：${JSON.stringify(entries)}`,
  ].join("\n");
}

/** body 模板开销（不含 entries JSON），用于估算单篇可容纳的 entry 数 */
function buildBodyOverhead(keywords: string, summary: string): string {
  return [
    `关键词：${keywords}`,
    ``,
    `摘要：${summary}`,
    ``,
    `entries：`,
  ].join("\n");
}

/** 将 entries 按 body 上限拆分为多批 */
function splitEntries(entries: DocEntry[], keywords: string, summary: string): DocEntry[][] {
  const overhead = Buffer.byteLength(buildBodyOverhead(keywords, summary), "utf-8");
  const batches: DocEntry[][] = [];
  let current: DocEntry[] = [];
  let currentSize = overhead;

  for (const entry of entries) {
    // 估算单个 entry 的大小（JSON 序列化 + 逗号分隔）
    const entryStr = (current.length > 0 ? "," : "") + JSON.stringify(entry);
    const entrySize = Buffer.byteLength(entryStr, "utf-8");

    if (currentSize + entrySize > YUQUE_BODY_MAX && current.length > 0) {
      // 当前批次满了，开新批次
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
 * 创建关键词索引文档（v3 — 关键词中心）
 *
 * 一个关键词 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * body 超过 195KB 时自动分片：关键词(1)、关键词(2) ...
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":10}]
 */
export async function createIndexDoc(params: CreateIndexDocParams): Promise<string> {
  const { keyword, keywords, summary, entries, index_book_id } = params;

  if (!keyword) throw new Error("keyword 不能为空");
  if (!entries || entries.length === 0) throw new Error("entries 不能为空");

  const cleanKw = cleanToken(keyword);
  const cleanKeywords = cleanKeywordsArray(keywords);

  // 为每个 entry 补 url（https://www.yuque.com/{ns}/{s}）
  const enrichedEntries = entries.map(e => ({
    ...e,
    url: e.url || (e.ns && e.s ? `https://www.yuque.com/${e.ns}/${e.s}` : undefined),
  }));

  const { route_book_sub, default_book } = loadConfig();
  const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
  if (!bookId) throw new Error("未指定 index_book_id 且未配置 route_book_sub 或 default_book");

  // 容量检查
  const capacityWarn = await checkRepoCapacity(bookId, "子索引库");
  if (capacityWarn) {
    return JSON.stringify({ warning: capacityWarn, created: false });
  }

  // 按 body 上限分片
  const batches = splitEntries(enrichedEntries, cleanKeywords, summary);

  const createdDocs: { doc_id: number; title: string; entries: number }[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const title = batches.length > 1 ? `${cleanKw}(${i + 1})` : cleanKw;
    const body = buildIndexBody(cleanKeywords, summary, batch);

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

    createdDocs.push({ doc_id: docId, title, entries: batch.length });
  }

  // 同步总库：创建关键词文档（entries 指向子索引库）
  let routeSynced = 0;
  try {
    const { route_book } = loadConfig();
    // 从配置中获取子索引库 namespace（bookId 匹配的第一个）
    const subNs = route_book_sub.find(b => String(b.book_id) === String(bookId))?.namespace ||
                  route_book_sub[0]?.namespace ||
                  default_book.namespace;

    const routeBody = `关键词：${cleanKeywords}

摘要：${summary}

entries：${JSON.stringify([{ book_id: bookId, namespace: subNs }])}`;

    for (const rb of route_book) {
      const rdata = await post(`/repos/${rb.book_id}/docs`, {
        title: cleanKw,
        body: routeBody,
        format: "markdown",
      }) as any;
      const rdoc = (rdata.data || rdata);
      await put(`/repos/${rb.book_id}/toc`, {
        action: "appendNode",
        action_mode: "child",
        target_uuid: "",
        type: "DOC",
        doc_ids: [rdoc.id],
      });
      routeSynced++;
    }
  } catch { /* 总库同步失败不影响子库写入 */ }

  return JSON.stringify({
    created: true,
    shards: batches.length,
    docs: createdDocs,
    keyword: cleanKw,
    total_entries: entries.length,
    route_synced: routeSynced,
  }, null, 2);
}

/**
 * 解析索引文档 body → keywords / summary / entries
 *
 * 兼容三种 entries 格式：
 *   JSON:     entries：[{"did":1,"ns":"x/x","t":"T","s":"s","w":10}]
 *   key-val:  entries：\n- did: 1, ns: x/x, t: T, s: s
 *   pipe:     entries：\n- 标题 | doc_id=1 | slug=s
 */
export function parseIndexDoc(body: string): ParsedIndexDoc {
  if (!body) return { keywords: [], summary: "", entries: [], parse_error: "空 body" };

  const keywordsRaw = extractLine(body, "关键词：");
  const keywords = parseKeywords(keywordsRaw);
  const summary = extractSection(body, "摘要：", "entries：");

  // entries 兼容三种格式
  const entries = parseEntries(body);

  const missing: string[] = [];
  if (!keywords || keywords.length === 0) missing.push("关键词");
  if (entries.length === 0) missing.push("entries");

  if (missing.length > 0) {
    return { keywords: keywords || [], summary: summary || "", entries: [], parse_error: `缺少字段: ${missing.join("/")}` };
  }

  return { keywords, summary, entries };
}

/** 解析 entries 区域，兼容 JSON / key-val / pipe 三种格式 */
function parseEntries(body: string): DocEntry[] {
  // 格式1: JSON — entries：[...] 或 entries：\n[...]
  const jsonMatch = body.match(/entries[：:]\s*\n?(\[[\s\S]*?\])\s*$/m);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
        return parsed;
      }
    } catch { /* fall through */ }
  }

  // 格式2/3: 提取 entries 之后的所有行，逐行解析
  const idx = body.search(/entries[：:]/);
  if (idx === -1) return [];

  const afterEntries = body.slice(idx).split(/\n/).slice(1); // entries 标签后的行
  const lineEntries: DocEntry[] = [];

  for (const line of afterEntries) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("关键词") || trimmed.startsWith("摘要")) break;

    // 格式2: "- did: 228406956, ns: yehuoshun/sk6rfn, t: 标题, s: slug"
    const kvMatch = trimmed.match(/^-\s*did:\s*(\d+).*?ns:\s*([^,]+).*?t:\s*(.+?),\s*s:\s*(\S+)/);
    if (kvMatch) {
      lineEntries.push({ did: Number(kvMatch[1]), ns: kvMatch[2], t: kvMatch[3].trim(), s: kvMatch[4] });
      continue;
    }

    // 格式3: "- 标题 | doc_id=228611383 | slug=hfe0l0hfz1au0la3"
    const pipeMatch = trimmed.match(/^-\s*(.+?)\s*\|\s*doc_id=(\d+)\s*\|\s*slug=(\S+)/);
    if (pipeMatch) {
      const title = pipeMatch[1].trim();
      const did = Number(pipeMatch[2]);
      const slug = pipeMatch[3];
      // 从 title 中提取可能的序号前缀，或者保留完整标题
      const cleanTitle = title.replace(/^\d+(\.\d+)*\s*/, "").trim();
      lineEntries.push({ did, ns: "", t: cleanTitle, s: slug });
      continue;
    }
  }

  return lineEntries;
}