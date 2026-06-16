/**
 * kv/common — KV 存储底层逻辑
 *
 * 方案：单文档 JSON map，一个 namespace 对应语雀知识库里的一篇文档。
 * 文档 slug = namespace，body = JSON.stringify({key: value, ...})
 *
 * 分片：单文档 body 上限 250KB，超出自动创建新分片。
 * 分片记录在 config.json 的 kv.namespaces 中：
 *   { "cnblogs": ["cnblogs", "cnblogs-2", "cnblogs-3"] }
 *
 * set 流程：读最后一个分片 → 判断大小 → PUT 更新或 POST 创建新分片 → 更新 config
 * get 流程：config 里取分片数组 → 逐个读 → 合并返回
 */

import { loadConfig, saveConfig } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";

/** 单文档 body 大小上限（字节） */
const MAX_BODY_SIZE = 250 * 1024; // 250KB

/** 从 RepoRef 提取知识库标识 */
function repoRefToString(ref: { id?: number; book_id?: string; namespace?: string } | undefined): string {
  if (!ref) return "";
  if (ref.id) return String(ref.id);
  if (ref.book_id) return ref.book_id;
  if (ref.namespace) return ref.namespace;
  return "";
}

/** 解析 KV 知识库 */
export function resolveKvRepo(): string {
  const cfg = loadConfig();
  return repoRefToString(cfg.kv?.default_repo);
}

/** 获取 namespace 的分片数组，不存在返回空数组 */
function getShards(namespace: string): string[] {
  const cfg = loadConfig();
  return cfg.kv?.namespaces?.[namespace] || [];
}

/** 更新 namespace 的分片数组并持久化 */
function setShards(namespace: string, shards: string[]): void {
  const cfg = loadConfig();
  if (!cfg.kv) cfg.kv = { enabled: true };
  if (!cfg.kv.namespaces) cfg.kv.namespaces = {};
  cfg.kv.namespaces[namespace] = shards;
  saveConfig();
}

/**
 * 计算新增一个 key-value 后 body 的预估大小
 */
function estimateNewSize(currentBody: string, key: string, value: string): number {
  // body 是 JSON.stringify(map)，末尾是 "}"，新 entry 插入到最后一个 "}" 之前
  const entry = JSON.stringify({ [key]: value });
  // 去掉外层 {}，保留内部 "key":"value"
  const entryInner = entry.slice(1, -1);
  const comma = currentBody.length > 2 ? 1 : 0; // 非空 map 需要逗号
  return Buffer.byteLength(currentBody, "utf-8") + comma + Buffer.byteLength(entryInner, "utf-8");
}

/**
 * 读取 namespace 的所有分片，合并为完整 JSON map
 */
export async function loadKvMap(repo: string, namespace: string): Promise<Record<string, string>> {
  const shards = getShards(namespace);
  // 没有分片记录 → 尝试旧单文档兼容
  if (shards.length === 0) {
    const data = await apiGet(`/repos/${repo}/docs/${namespace}?raw=1`, undefined, `KV load: ${namespace}`);
    if (isErrorResult(data)) return {};
    const body = (data as { data?: { body?: string } })?.data?.body;
    if (!body) return {};
    try { return JSON.parse(body); } catch { return {}; }
  }

  // 按分片数组逐个读
  const result: Record<string, string> = {};
  for (const ns of shards) {
    const data = await apiGet(`/repos/${repo}/docs/${ns}?raw=1`, undefined, `KV load: ${ns}`);
    if (isErrorResult(data)) continue;
    const body = (data as { data?: { body?: string } })?.data?.body;
    if (!body) continue;
    try { Object.assign(result, JSON.parse(body)); } catch { /* ignore */ }
  }
  return result;
}

/**
 * 增量 set：在 namespace 中设置一个 key-value
 *
 * 流程：
 * 1. 读 config 获取分片数组
 * 2. 读最后一个分片文档（获取 body + doc_id）
 * 3. 预估新增后大小 → 没超就 PUT 更新，超了就 POST 创建新分片
 * 4. 更新 config 分片数组（新分片 push）
 */
export async function kvIncrementalSet(
  repo: string,
  namespace: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const shards = getShards(namespace);
  const entryJson = JSON.stringify({ [key]: value });

  // 没有分片 → 首次创建
  if (shards.length === 0) {
    const body = entryJson;
    const newNs = namespace;
    const result = await apiPost(
      `/repos/${repo}/docs`,
      { title: newNs, body, slug: newNs, format: "markdown", public: 0 },
      `KV create: ${newNs}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    setShards(namespace, [newNs]);
    return { ok: true, shards: 1 };
  }

  // 读最后一个分片
  const lastNs = shards[shards.length - 1];
  const data = await apiGet(`/repos/${repo}/docs/${lastNs}?raw=1`, undefined, `KV load: ${lastNs}`);
  if (isErrorResult(data)) {
    return { ok: false, error: `读分片 ${lastNs} 失败` };
  }

  const doc = (data as { data?: { id: number; body?: string } })?.data;
  if (!doc) {
    return { ok: false, error: `分片 ${lastNs} 数据为空` };
  }

  const currentBody = doc.body || "{}";
  let currentMap: Record<string, string>;
  try {
    currentMap = JSON.parse(currentBody);
  } catch {
    currentMap = {};
  }

  // key 已存在 → 更新 value
  currentMap[key] = value;
  const newBody = JSON.stringify(currentMap, null, 2);

  // 判断大小
  if (Buffer.byteLength(newBody, "utf-8") <= MAX_BODY_SIZE) {
    // 没超 → PUT 更新当前分片
    const result = await apiPut(
      `/repos/${repo}/docs/${doc.id}`,
      { title: lastNs, body: newBody, slug: lastNs, format: "markdown", public: 0 },
      `KV update: ${lastNs}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: shards.length };
  }

  // 超了 → 回退当前分片（去掉刚加的 key），创建新分片
  delete currentMap[key];
  const oldBody = JSON.stringify(currentMap, null, 2);

  // PUT 回退当前分片
  await apiPut(
    `/repos/${repo}/docs/${doc.id}`,
    { title: lastNs, body: oldBody, slug: lastNs, format: "markdown", public: 0 },
    `KV rollback: ${lastNs}`,
  );

  // POST 创建新分片
  const newNs = `${namespace}-${shards.length + 1}`;
  const result = await apiPost(
    `/repos/${repo}/docs`,
    { title: newNs, body: entryJson, slug: newNs, format: "markdown", public: 0 },
    `KV create shard: ${newNs}`,
  );
  if (isErrorResult(result)) {
    return { ok: false, error: JSON.stringify(result) };
  }

  shards.push(newNs);
  setShards(namespace, shards);
  return { ok: true, shards: shards.length };
}

/**
 * 增量 delete：从 namespace 中删除一个 key
 *
 * 流程：
 * 1. 遍历所有分片找到 key 所在分片
 * 2. 从 map 中删除 key → PUT 更新该分片
 */
export async function kvIncrementalDelete(
  repo: string,
  namespace: string,
  key: string,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const shards = getShards(namespace);
  if (shards.length === 0) {
    return { ok: false, error: `namespace '${namespace}' 不存在` };
  }

  for (const ns of shards) {
    const data = await apiGet(`/repos/${repo}/docs/${ns}?raw=1`, undefined, `KV load: ${ns}`);
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
      `/repos/${repo}/docs/${doc.id}`,
      { title: ns, body: newBody, slug: ns, format: "markdown", public: 0 },
      `KV delete key: ${ns}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, shards: shards.length };
  }

  return { ok: false, error: `key '${key}' not found in namespace '${namespace}'` };
}
