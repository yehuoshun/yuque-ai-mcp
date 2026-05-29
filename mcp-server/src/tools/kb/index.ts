import { get, post, put } from "../../client.js";
import { loadConfig } from "../../config.js";
import { CreateIndexDocParams, DocEntry, ParsedIndexDoc } from "./types.js";
import { cleanToken, cleanKeywordsArray, extractLine, extractSection, parseKeywords } from "./utils.js";

// 容量上限阈值
const SUB_INDEX_LIMIT = 200;  // 子索引库上限
const ROUTE_LIMIT = 300;      // 总库路由文档上限

/** 检查知识库文档数是否接近上限，返回提示字符串（无问题返回空字符串） */
async function checkRepoCapacity(bookId: number | string, limit: number, label: string): Promise<string> {
  try {
    const data = await get(`/repos/${bookId}`) as any;
    const repo = data.data || data;
    const count = repo.items_count || 0;
    if (count >= limit) {
      return `⚠️ ${label}（${repo.name || bookId}）当前已有 ${count} 篇文档，已达到上限（${limit}）。\n请新建一个库或申请扩容后重试。`;
    }
    if (count >= limit * 0.8) {
      return `⚠️ ${label}（${repo.name || bookId}）已有 ${count} 篇文档，接近上限（${limit}）。\n如继续构建可能受限，建议提前新建库或申请扩容。请确认是否继续。`;
    }
  } catch {}
  return "";
}

/**
 * 创建关键词索引文档（v3 — 关键词中心）
 *
 * 一个关键词 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
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

  const body = [
    `关键词：${cleanKeywords}`,
    ``,
    `摘要：${summary}`,
    ``,
    `entries：`,
    JSON.stringify(enrichedEntries),
  ].join("\n");

  const { route_book_sub, default_book } = loadConfig();
  const bookId = index_book_id || route_book_sub[0]?.book_id || default_book.book_id;
  if (!bookId) throw new Error("未指定 index_book_id 且未配置 route_book_sub 或 default_book");

  // 容量检查
  const capacityWarn = await checkRepoCapacity(bookId, SUB_INDEX_LIMIT, "子索引库");
  if (capacityWarn) {
    return JSON.stringify({ warning: capacityWarn, created: false });
  }

  const data = await post(`/repos/${bookId}/docs`, {
    title: cleanKw,
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

  return JSON.stringify({
    created: true,
    doc_id: docId,
    keyword: cleanKw,
    entries: entries.length,
    title: cleanKw,
  }, null, 2);
}

/**
 * 解析索引文档 body → keywords / summary / entries
 */
export function parseIndexDoc(body: string): ParsedIndexDoc {
  if (!body) return { keywords: [], summary: "", entries: [], parse_error: "空 body" };

  const keywordsRaw = extractLine(body, "关键词：");
  const keywords = parseKeywords(keywordsRaw);
  const summary = extractSection(body, "摘要：", "entries：");
  const entriesRaw = extractLine(body, "entries：");

  const missing: string[] = [];
  if (!keywords || keywords.length === 0) missing.push("关键词");
  if (!entriesRaw) missing.push("entries");

  if (missing.length > 0) {
    return { keywords: keywords || [], summary: summary || "", entries: [], parse_error: `缺少字段: ${missing.join("/")}` };
  }

  let entries: DocEntry[] = [];
  try {
    const parsed = JSON.parse(entriesRaw);
    if (Array.isArray(parsed)) entries = parsed;
  } catch {
    return { keywords, summary, entries: [], parse_error: "entries JSON 解析失败" };
  }

  return { keywords, summary, entries };
}