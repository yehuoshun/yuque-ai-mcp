/**
 * kv/common — KV 存储底层逻辑
 *
 * 方案：单文档 JSON map，一个 namespace 对应语雀知识库里的一篇或多篇文档。
 * 文档 body = JSON.stringify({key: value, ...})
 *
 * 分片：单文档 body 上限 250KB，超出自动创建新分片。
 * 分片记录在 config.json 的 kv.namespaces 中：
 *   { "cnblogs": { "book_id": 80197550, "docs": [274162639, 274162640] } }
 *
 * set 流程：取最后一个 doc_id → GET 读 body → 判断 JSON.stringify 后大小 → PUT 更新或 POST 创建新分片 → push doc_id 到 config
 * get 流程：遍历 docs 数组 → 逐个读 → 合并返回
 */

import { loadConfig, saveConfig } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";

/** 单文档 body 大小上限（字节） */
const MAX_BODY_SIZE = 250 * 1024; // 250KB

/** 获取 namespace 配置 */
function getNs(namespace: string) {
  const cfg = loadConfig();
  return cfg.kv?.namespaces?.[namespace];
}

/** 更新 namespace 的 docs 数组并持久化 */
function setNsDocs(namespace: string, bookId: number, docs: number[]): void {
  const cfg = loadConfig();
  if (!cfg.kv) cfg.kv = { enabled: true };
  if (!cfg.kv.namespaces) cfg.kv.namespaces = {};
  cfg.kv.namespaces[namespace] = { book_id: bookId, docs };
  saveConfig();
}

/**
 * 读取 namespace 的所有分片，合并为完整 JSON map
 */
export async function loadKvMap(namespace: string): Promise<Record<string, string>> {
  const ns = getNs(namespace);
  if (!ns || ns.docs.length === 0) return {};

  const result: Record<string, string> = {};
  for (const docId of ns.docs) {
    const data = await apiGet(`/repos/${ns.book_id}/docs/${docId}?raw=1`, undefined, `KV load: ${docId}`);
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
  namespace: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const ns = getNs(namespace);
  const entryJson = JSON.stringify({ [key]: value });

  // 没有分片 → 首次创建
  if (!ns || ns.docs.length === 0) {
    const bookId = ns?.book_id;
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
    setNsDocs(namespace, bookId, [docId]);
    return { ok: true, shards: 1 };
  }

  const bookId = ns.book_id;
  const lastDocId = ns.docs[ns.docs.length - 1];

  // 读最后一个分片
  const data = await apiGet(`/repos/${bookId}/docs/${lastDocId}?raw=1`, undefined, `KV load: ${lastDocId}`);
  if (isErrorResult(data)) {
    return { ok: false, error: `读分片 ${lastDocId} 失败` };
  }

  const doc = (data as { data?: { id: number; body?: string } })?.data;
  if (!doc) {
    return { ok: false, error: `分片 ${lastDocId} 数据为空` };
  }

  const currentBody = doc.body || "{}";
  let currentMap: Record<string, string>;
  try {
    currentMap = JSON.parse(currentBody);
  } catch {
    currentMap = {};
  }

  currentMap[key] = value;
  const newBody = JSON.stringify(currentMap, null, 2);

  // 判断大小
  if (Buffer.byteLength(newBody, "utf-8") <= MAX_BODY_SIZE) {
    // 没超 → PUT 更新当前分片
    const result = await apiPut(
      `/repos/${bookId}/docs/${doc.id}`,
      { title: namespace, body: newBody, slug: namespace, format: "markdown", public: 0 },
      `KV update: ${lastDocId}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: ns.docs.length };
  }

  // 超了 → 创建新分片，只写这一个 key
  const result = await apiPost(
    `/repos/${bookId}/docs`,
    { title: `${namespace}-${ns.docs.length + 1}`, body: entryJson, slug: `${namespace}-${ns.docs.length + 1}`, format: "markdown", public: 0 },
    `KV create shard: ${namespace}-${ns.docs.length + 1}`,
  );
  if (isErrorResult(result)) {
    return { ok: false, error: JSON.stringify(result) };
  }

  const newDocId = (result as { data?: { id: number } })?.data?.id;
  if (!newDocId) {
    return { ok: false, error: "创建分片后未获取到 doc_id" };
  }

  ns.docs.push(newDocId);
  setNsDocs(namespace, bookId, ns.docs);
  return { ok: true, shards: ns.docs.length };
}

/**
 * 增量 delete：从 namespace 中删除一个 key
 */
export async function kvIncrementalDelete(
  namespace: string,
  key: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const ns = getNs(namespace);
  if (!ns || ns.docs.length === 0) {
    return { ok: false, error: `namespace '${namespace}' 不存在` };
  }

  for (const docId of ns.docs) {
    const data = await apiGet(`/repos/${ns.book_id}/docs/${docId}?raw=1`, undefined, `KV load: ${docId}`);
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
      `/repos/${ns.book_id}/docs/${doc.id}`,
      { title: namespace, body: newBody, slug: namespace, format: "markdown", public: 0 },
      `KV delete key: ${docId}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: ns.docs.length };
  }

  return { ok: false, error: `key '${key}' not found in namespace '${namespace}'` };
}