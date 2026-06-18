/**
 * kv/common — KV 存储底层逻辑
 *
 * 方案：单文档 JSON map，按 domain:namespace 定位 config 中的 kv_slugs。
 * slug 格式：`{book_id}/{doc_id}`，config.json 中存为数组。
 *
 * config 结构：
 *   { "rss": { "namespaces": { "cnblogs": { "book_id": ..., "kv_slugs": ["80197550/274164064"], ... } } } }
 *
 * set 流程：取最后一个 slug → GET 读 body → 判断大小 → PUT 更新或 POST 创建新分片 → push 新 slug 到 config
 * get 流程：遍历 kv_slugs 数组 → 逐个读 → 合并返回
 */

import { loadConfig, saveConfig, parseSlug, buildSlugStr } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";

/** 单文档 body 大小上限（字节） */
const MAX_BODY_SIZE = 250 * 1024; // 250KB

/** 获取 domain 下 namespace 的 kv_slugs */
function getKvSlugs(domain: "rss" | "crawler", namespace: string): string[] {
  const cfg = loadConfig();
  return cfg[domain]?.namespaces?.[namespace]?.kv_slugs ?? [];
}

/** 获取 domain 下 namespace 的 book_id（用于首次创建 KV 分片） */
function getBookId(domain: "rss" | "crawler", namespace: string): number | null {
  const cfg = loadConfig();
  return cfg[domain]?.namespaces?.[namespace]?.book_id ?? null;
}

/** 更新 namespace 的 kv_slugs 数组并持久化 */
function setKvSlugs(domain: "rss" | "crawler", namespace: string, slugs: string[]): void {
  const cfg = loadConfig();
  if (!cfg[domain]) cfg[domain] = { enabled: true, namespaces: {} } as never;
  if (!cfg[domain]!.namespaces) cfg[domain]!.namespaces = {};
  if (!cfg[domain]!.namespaces![namespace]) {
    cfg[domain]!.namespaces![namespace] = { book_id: 0 };
  }
  cfg[domain]!.namespaces![namespace].kv_slugs = slugs;
  saveConfig();
}

/** 更新 namespace 的 schedule_slugs 数组并持久化 */
export function setScheduleSlugs(domain: "rss" | "crawler", namespace: string, slugs: string[]): void {
  const cfg = loadConfig();
  if (!cfg[domain]) cfg[domain] = { enabled: true, namespaces: {} } as never;
  if (!cfg[domain]!.namespaces) cfg[domain]!.namespaces = {};
  if (!cfg[domain]!.namespaces![namespace]) {
    cfg[domain]!.namespaces![namespace] = { book_id: 0 };
  }
  cfg[domain]!.namespaces![namespace].schedule_slugs = slugs;
  saveConfig();
}

/**
 * 读取 namespace 的所有分片，合并为完整 JSON map
 */
export async function loadKvMap(domain: "rss" | "crawler", namespace: string): Promise<Record<string, string>> {
  const slugs = getKvSlugs(domain, namespace);
  if (slugs.length === 0) return {};

  const result: Record<string, string> = {};
  for (const slug of slugs) {
    const parsed = parseSlug(slug);
    if (!parsed) continue;
    const data = await apiGet(`/repos/${parsed.bookId}/docs/${parsed.docId}?raw=1`, undefined, `KV load: ${parsed.docId}`);
    if (isErrorResult(data)) continue;
    const body = (data as { data?: { body?: string } })?.data?.body;
    if (!body) continue;
    try { Object.assign(result, JSON.parse(body)); } catch { /* ignore */ }
  }
  return result;
}

/**
 * 增量 set：在 namespace 中设置一个 key-value
 */
export async function kvIncrementalSet(
  domain: "rss" | "crawler",
  namespace: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const slugs = getKvSlugs(domain, namespace);
  const entryJson = JSON.stringify({ [key]: value });
  const bookId = getBookId(domain, namespace);

  // 没有分片 → 首次创建
  if (slugs.length === 0) {
    if (!bookId) {
      return { ok: false, error: `namespace '${namespace}' 未配置 book_id` };
    }
    const result = await apiPost(
      `/repos/${bookId}/docs`,
      { title: namespace, body: entryJson, slug: namespace, format: "markdown", public: 0 },
      `KV create: ${namespace}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    const docId = (result as { data?: { id: number } })?.data?.id;
    if (!docId) {
      return { ok: false, error: "创建文档后未获取到 doc_id" };
    }
    const newSlug = buildSlugStr(bookId, docId);
    setKvSlugs(domain, namespace, [newSlug]);
    return { ok: true, shards: 1 };
  }

  // 取最后一个分片
  const lastSlug = slugs[slugs.length - 1];
  const parsed = parseSlug(lastSlug);
  if (!parsed) {
    return { ok: false, error: `无效 slug: ${lastSlug}` };
  }

  // 读最后一个分片
  const data = await apiGet(`/repos/${parsed.bookId}/docs/${parsed.docId}?raw=1`, undefined, `KV load: ${parsed.docId}`);
  if (isErrorResult(data)) {
    return { ok: false, error: `读分片 ${parsed.docId} 失败` };
  }

  const doc = (data as { data?: { id: number; body?: string } })?.data;
  if (!doc) {
    return { ok: false, error: `分片 ${parsed.docId} 数据为空` };
  }

  const currentBody = doc.body || "{}";
  let currentMap: Record<string, string>;
  try { currentMap = JSON.parse(currentBody); } catch { currentMap = {}; }

  currentMap[key] = value;
  const newBody = JSON.stringify(currentMap, null, 2);

  // 判断大小
  if (Buffer.byteLength(newBody, "utf-8") <= MAX_BODY_SIZE) {
    // 没超 → PUT 更新当前分片
    const result = await apiPut(
      `/repos/${parsed.bookId}/docs/${doc.id}`,
      { title: namespace, body: newBody, slug: namespace, format: "markdown", public: 0 },
      `KV update: ${parsed.docId}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: slugs.length };
  }

  // 超了 → 创建新分片，只写这一个 key
  const result = await apiPost(
    `/repos/${parsed.bookId}/docs`,
    { title: `${namespace}-${slugs.length + 1}`, body: entryJson, slug: `${namespace}-${slugs.length + 1}`, format: "markdown", public: 0 },
    `KV create shard: ${namespace}-${slugs.length + 1}`,
  );
  if (isErrorResult(result)) {
    return { ok: false, error: JSON.stringify(result) };
  }

  const newDocId = (result as { data?: { id: number } })?.data?.id;
  if (!newDocId) {
    return { ok: false, error: "创建分片后未获取到 doc_id" };
  }

  const newSlug = buildSlugStr(parsed.bookId, newDocId);
  const newSlugs = [...slugs, newSlug];
  setKvSlugs(domain, namespace, newSlugs);
  return { ok: true, shards: newSlugs.length };
}

/**
 * 增量 delete：从 namespace 中删除一个 key
 */
export async function kvIncrementalDelete(
  domain: "rss" | "crawler",
  namespace: string,
  key: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const slugs = getKvSlugs(domain, namespace);
  if (slugs.length === 0) {
    return { ok: false, error: `namespace '${namespace}' KV 分片不存在` };
  }

  for (const slug of slugs) {
    const parsed = parseSlug(slug);
    if (!parsed) continue;

    const data = await apiGet(`/repos/${parsed.bookId}/docs/${parsed.docId}?raw=1`, undefined, `KV load: ${parsed.docId}`);
    if (isErrorResult(data)) continue;

    const doc = (data as { data?: { id: number; body?: string } })?.data;
    if (!doc) continue;

    const currentBody = doc.body || "{}";
    let currentMap: Record<string, string>;
    try { currentMap = JSON.parse(currentBody); } catch { continue; }

    if (!(key in currentMap)) continue;

    delete currentMap[key];
    const newBody = JSON.stringify(currentMap, null, 2);

    const result = await apiPut(
      `/repos/${parsed.bookId}/docs/${doc.id}`,
      { title: namespace, body: newBody, slug: namespace, format: "markdown", public: 0 },
      `KV delete key: ${parsed.docId}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: slugs.length };
  }

  return { ok: false, error: `key '${key}' not found in namespace '${namespace}'` };
}