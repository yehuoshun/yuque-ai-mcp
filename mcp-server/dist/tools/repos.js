import { get, post, del } from "../client.js";
import { loadConfig } from "../config.js";
/**
 * 列出用户的所有知识库
 */
export async function listRepos() {
    const { group } = loadConfig();
    const data = await get(`/users/${group}/repos`);
    const repos = data.data || data;
    const lines = (Array.isArray(repos) ? repos : []).map((r) => `- ${r.name} (id=${r.id}, slug=${r.slug})`);
    return lines.length > 0 ? lines.join("\n") : "暂无知识库";
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
    const data = await post(`/users/${group}/repos`, { name: params.name, slug });
    const r = data.data || data;
    return `✅ 知识库已创建: ${r.name} (id=${r.id}, namespace=${group}/${slug})`;
}
/**
 * 删除知识库
 */
export async function deleteRepo(params) {
    await del(`/repos/${params.id_or_namespace}`);
    return `✅ 知识库已删除: ${params.id_or_namespace}`;
}
// ---------- 工具 ----------
function generateSlug(name) {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${base}-${ts}${rand}`;
}
//# sourceMappingURL=repos.js.map