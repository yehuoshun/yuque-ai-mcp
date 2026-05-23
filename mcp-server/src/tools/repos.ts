import { get, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";

/**
 * 列出用户的所有知识库
 */
export async function listRepos(): Promise<string> {
  const { group } = loadConfig();
  const data = await get(`/users/${group}/repos`);
  const repos = (data as any).data || data;

  const lines = (Array.isArray(repos) ? repos : []).map(
    (r: any) => `- ${r.name} (id=${r.id}, slug=${r.slug})`
  );

  return lines.length > 0 ? lines.join("\n") : "暂无知识库";
}

/**
 * 获取知识库详情
 */
export async function getRepo(params: { id_or_namespace: string }): Promise<string> {
  const data = await get(`/repos/${params.id_or_namespace}`);
  const r = (data as any).data || data;
  return JSON.stringify(
    { id: r.id, name: r.name, slug: r.slug, description: r.description, items_count: r.items_count },
    null,
    2
  );
}

/**
 * 创建知识库
 */
export async function createRepo(params: { name: string; slug?: string }): Promise<string> {
  const { group } = loadConfig();
  const slug = params.slug || generateSlug(params.name);
  const data = await post(`/users/${group}/repos`, { name: params.name, slug });
  const r = (data as any).data || data;
  return `✅ 知识库已创建: ${r.name} (id=${r.id}, namespace=${group}/${slug})`;
}

/**
 * 更新知识库
 */
export async function updateRepo(params: {
  id_or_namespace: string;
  name?: string;
  slug?: string;
  description?: string;
  public?: 0 | 1 | 2;
}): Promise<string> {
  const payload: Record<string, any> = {};
  if (params.name) payload.name = params.name;
  if (params.slug) payload.slug = params.slug;
  if (params.description !== undefined) payload.description = params.description;
  if (params.public !== undefined) payload.public = params.public;

  await put(`/repos/${params.id_or_namespace}`, payload);
  return `✅ 知识库已更新: ${params.id_or_namespace}`;
}

/**
 * 删除知识库
 */
export async function deleteRepo(params: { id_or_namespace: string }): Promise<string> {
  await del(`/repos/${params.id_or_namespace}`);
  return `✅ 知识库已删除: ${params.id_or_namespace}`;
}

// ---------- 工具 ----------

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${ts}${rand}`;
}