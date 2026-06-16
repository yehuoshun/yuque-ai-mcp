/**
 * kv/common — KV 存储底层逻辑
 *
 * 方案：单文档 JSON map，一个 namespace 对应语雀知识库里的一篇文档。
 * 文档 slug = namespace，body = JSON.stringify({key: value, ...})
 *
 * API 调用：
 *   - 读：GET /repos/{repo}/docs/{namespace} → 解析 body 为 JSON
 *   - 写：PUT /repos/{repo}/docs/{doc_id}（更新已有文档）
 *   - 创建：POST /repos/{repo}/docs（首次创建）
 *
 * 大小限制：单文档 body 上限 250KB（条数取决于 key/value 长度）。
 * 实测数据：232KB 读 2s，466KB 读 5.7s，955KB 读 21.8s。
 * 超过上限自动分片：namespace → namespace-1, namespace-2, ...
 */

import { loadConfig } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";

/** 单文档 body 大小上限（字节），约 5000 条记录 */
const MAX_BODY_SIZE = 250 * 1024; // 250KB

/** 单个 namespace 最大分片数 */
const MAX_SHARDS = 100;

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

/** KV 文档元信息 */
interface KvDocMeta {
  id: number;
  slug: string;
}

/**
 * 查找 namespace 对应的文档
 * GET /repos/{repo}/docs/{namespace}
 * 返回文档 id + slug，不存在返回 null
 */
async function findKvDoc(repo: string, namespace: string): Promise<KvDocMeta | null> {
  const data = await apiGet(`/repos/${repo}/docs/${namespace}`, undefined, `KV find: ${namespace}`);
  if (isErrorResult(data)) return null;
  const doc = (data as { data?: { id: number; slug: string } })?.data;
  if (!doc) return null;
  return { id: doc.id, slug: doc.slug };
}

/**
 * 将 map 按大小拆分为多个分片
 * 每个分片 body 不超过 MAX_BODY_SIZE
 */
function splitMap(map: Record<string, string>): Record<string, string>[] {
  const shards: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  let currentSize = 2; // "{}"

  for (const [key, value] of Object.entries(map)) {
    const entry = JSON.stringify({ [key]: value });
    const entrySize = Buffer.byteLength(entry, "utf-8") - 2; // 去掉外层 {}
    const comma = currentSize > 2 ? 1 : 0; // 逗号

    if (currentSize + comma + entrySize > MAX_BODY_SIZE && Object.keys(current).length > 0) {
      shards.push(current);
      current = {};
      currentSize = 2;
    }

    current[key] = value;
    currentSize += comma + entrySize;
  }

  if (Object.keys(current).length > 0) {
    shards.push(current);
  }

  return shards;
}

/** 生成分片 namespace */
function shardNamespace(namespace: string, index: number): string {
  return `${namespace}-${index}`;
}

/**
 * 写入单个分片文档
 */
async function writeShard(
  repo: string,
  ns: string,
  map: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify(map, null, 2);
  const doc = await findKvDoc(repo, ns);

  if (doc) {
    const result = await apiPut(
      `/repos/${repo}/docs/${doc.id}`,
      { title: ns, body, slug: ns, format: "markdown", public: 0 },
      `KV update: ${ns}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true };
  }

  const result = await apiPost(
    `/repos/${repo}/docs`,
    { title: ns, body, slug: ns, format: "markdown", public: 0 },
    `KV create: ${ns}`,
  );
  if (isErrorResult(result)) {
    return { ok: false, error: JSON.stringify(result) };
  }
  return { ok: true };
}

/**
 * 保存 JSON map 到 namespace（自动分片）
 *
 * 如果 map 总大小超过 MAX_BODY_SIZE（250KB），自动拆分为多个分片文档：
 *   namespace-1, namespace-2, ...
 *
 * 注意：保存时会先清理旧分片（namespace-*），再写入新分片。
 */
export async function saveKvMap(
  repo: string,
  namespace: string,
  map: Record<string, string>,
): Promise<{ ok: boolean; error?: string; shards?: number }> {
  const shards = splitMap(map);

  if (shards.length > MAX_SHARDS) {
    return {
      ok: false,
      error: `KV map 过大：${shards.length} 个分片，超过上限 ${MAX_SHARDS}。请清理过期数据。`,
    };
  }

  // 清理旧分片（namespace-N 形式）
  for (let i = 1; i <= MAX_SHARDS; i++) {
    const oldNs = shardNamespace(namespace, i);
    const oldDoc = await findKvDoc(repo, oldNs);
    if (!oldDoc) break; // 没有更多旧分片
    // 如果这个分片号在新分片范围内，跳过（会被覆盖）
    if (i <= shards.length) continue;
    // 删除多余旧分片
    try {
      const { apiDelete } = await import("../common/api-client.js");
      await apiDelete(`/repos/${repo}/docs/${oldDoc.id}`, `KV delete shard: ${oldNs}`);
    } catch { /* 删除失败不影响主流程 */ }
  }

  // 写入所有分片
  const errors: string[] = [];
  for (let i = 0; i < shards.length; i++) {
    const ns = shardNamespace(namespace, i + 1);
    const result = await writeShard(repo, ns, shards[i]);
    if (!result.ok) {
      errors.push(`分片 ${ns}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("; "), shards: shards.length };
  }

  return { ok: true, shards: shards.length };
}

/**
 * 读取 namespace 的所有分片，合并为完整 JSON map
 * 返回 {key: value} 对象，不存在返回 {}
 */
export async function loadKvMap(repo: string, namespace: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // 先尝试读单个文档（兼容旧数据，无分片）
  const singleDoc = await findKvDoc(repo, namespace);
  if (singleDoc) {
    const data = await apiGet(`/repos/${repo}/docs/${singleDoc.slug}?raw=1`, undefined, `KV load: ${namespace}`);
    if (!isErrorResult(data)) {
      const body = (data as { data?: { body?: string } })?.data?.body;
      if (body) {
        try {
          Object.assign(result, JSON.parse(body));
        } catch { /* ignore */ }
      }
    }
    return result;
  }

  // 尝试读分片 namespace-1, namespace-2, ...
  for (let i = 1; i <= MAX_SHARDS; i++) {
    const ns = shardNamespace(namespace, i);
    const doc = await findKvDoc(repo, ns);
    if (!doc) break; // 没有更多分片

    const data = await apiGet(`/repos/${repo}/docs/${doc.slug}?raw=1`, undefined, `KV load: ${ns}`);
    if (isErrorResult(data)) continue;

    const body = (data as { data?: { body?: string } })?.data?.body;
    if (!body) continue;

    try {
      Object.assign(result, JSON.parse(body));
    } catch { /* ignore */ }
  }

  return result;
}
