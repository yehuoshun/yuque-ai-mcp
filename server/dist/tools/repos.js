import { get, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 列出用户的所有知识库（自动翻页，确保不漏）
 */
export async function listRepos(params) {
    const { group } = loadConfig();
    const PAGE_SIZE = 100;
    if (params?.offset !== undefined) {
        // 指定 offset → 只拿一页
        const data = await get(`/users/${group}/repos?offset=${params.offset}&limit=${PAGE_SIZE}`);
        const repos = data.data || data;
        if (!Array.isArray(repos) || repos.length === 0)
            return JSON.stringify([]);
        return JSON.stringify(repos.map((r) => ({
            id: r.id, name: r.name, slug: r.slug, items_count: r.items_count,
        })), null, 2);
    }
    // 不指定 → 自动翻页全量
    const allRepos = [];
    for (let offset = 0;; offset += PAGE_SIZE) {
        const data = await get(`/users/${group}/repos?offset=${offset}&limit=${PAGE_SIZE}`);
        const repos = data.data || data;
        if (!Array.isArray(repos) || repos.length === 0)
            break;
        allRepos.push(...repos);
        if (repos.length < PAGE_SIZE)
            break;
    }
    if (allRepos.length === 0)
        return JSON.stringify([]);
    return JSON.stringify(allRepos.map((r) => ({
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
    const payload = { name: params.name, slug: params.slug };
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
//# sourceMappingURL=repos.js.map