import { get, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 列出用户的所有知识库
 */
export async function listRepos() {
    const { group } = loadConfig();
    const data = await get(`/users/${group}/repos`);
    const repos = data.data || data;
    if (!Array.isArray(repos) || repos.length === 0)
        return JSON.stringify([]);
    return JSON.stringify(repos.map((r) => ({
        id: r.id, name: r.name, slug: r.slug, items_count: r.items_count,
    })), null, 2);
}
/**
 * 获取知识库详情
 */
export async function getRepo(params) {
    const data = await get(`/repos/${params.id_or_namespace}`);
    const r = data.data || data;
    return JSON.stringify({ id: r.id, name: r.name, slug: r.slug, description: r.description, items_count: r.items_count }, null, 2);
}
/**
 * 创建知识库
 */
export async function createRepo(params) {
    const { group } = loadConfig();
    const slug = params.slug || generateSlug(params.name);
    const payload = { name: params.name, slug };
    if (params.description)
        payload.description = params.description;
    if (params.public !== undefined)
        payload.public = params.public;
    const data = await post(`/users/${group}/repos`, payload);
    const r = data.data || data;
    return JSON.stringify(r, null, 2);
}
/**
 * 更新知识库
 */
export async function updateRepo(params) {
    const payload = {};
    if (params.name)
        payload.name = params.name;
    if (params.slug)
        payload.slug = params.slug;
    if (params.description !== undefined)
        payload.description = params.description;
    if (params.public !== undefined)
        payload.public = params.public;
    const data = await put(`/repos/${params.id_or_namespace}`, payload);
    const repo = data.data || data;
    return JSON.stringify(repo, null, 2);
}
/**
 * 删除知识库
 */
export async function deleteRepo(params) {
    await del(`/repos/${params.id_or_namespace}`);
    return JSON.stringify({ deleted: true, id_or_namespace: params.id_or_namespace });
}
// ---------- 工具 ----------
function generateSlug(name) {
    // {拼音缩写}-{时间戳秒}
    // 取前几个字符做缩写，时间戳秒避免冲突
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 12);
    const ts = Math.floor(Date.now() / 1000);
    return `${base}-${ts}`;
}
//# sourceMappingURL=repos.js.map