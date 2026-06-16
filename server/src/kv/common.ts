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
 */

import { loadConfig } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";

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
 * 读取 namespace 对应的 JSON map
 * 返回 {key: value} 对象，不存在返回 {}
 */
export async function loadKvMap(repo: string, namespace: string): Promise<Record<string, string>> {
  const doc = await findKvDoc(repo, namespace);
  if (!doc) return {};

  const data = await apiGet(`/repos/${repo}/docs/${doc.slug}?raw=1`, undefined, `KV load: ${namespace}`);
  if (isErrorResult(data)) return {};

  const body = (data as { data?: { body?: string } })?.data?.body;
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

/**
 * 保存 JSON map 到 namespace 文档
 * 文档存在则 PUT 更新，不存在则 POST 创建
 */
export async function saveKvMap(
  repo: string,
  namespace: string,
  map: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify(map, null, 2);
  const doc = await findKvDoc(repo, namespace);

  if (doc) {
    // 更新已有文档
    const result = await apiPut(
      `/repos/${repo}/docs/${doc.id}`,
      { title: namespace, body, slug: namespace, format: "markdown", public: 0 },
      `KV update: ${namespace}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true };
  }

  // 创建新文档
  const result = await apiPost(
    `/repos/${repo}/docs`,
    { title: namespace, body, slug: namespace, format: "markdown", public: 0 },
    `KV create: ${namespace}`,
  );
  if (isErrorResult(result)) {
    return { ok: false, error: JSON.stringify(result) };
  }
  return { ok: true };
}
