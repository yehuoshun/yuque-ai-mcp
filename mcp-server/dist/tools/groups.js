import { get, put, del } from "../client.js";
/**
 * 列出群组成员
 */
export async function listGroupUsers(params) {
    const offset = params.offset ?? 0;
    let url = `/groups/${params.login}/users?offset=${offset}`;
    if (params.role !== undefined)
        url += `&role=${params.role}`;
    const data = await get(url);
    const users = data.data || data;
    if (!Array.isArray(users) || users.length === 0)
        return "暂无成员";
    const lines = users.map((u) => `- ${u.user?.name || "未知"} (login=${u.user?.login}, role=${u.role === 0 ? "管理员" : u.role === 1 ? "成员" : "只读"})`);
    return lines.join("\n");
}
/**
 * 更新群组成员角色
 */
export async function updateGroupUser(params) {
    await put(`/groups/${params.login}/users/${params.user_id}`, { role: params.role });
    const label = params.role === 0 ? "管理员" : params.role === 1 ? "成员" : "只读";
    return `✅ 成员角色已更新为 ${label}: user_id=${params.user_id}`;
}
/**
 * 移除群组成员
 */
export async function removeGroupUser(params) {
    await del(`/groups/${params.login}/users/${params.user_id}`);
    return `✅ 成员已移除: user_id=${params.user_id}`;
}
//# sourceMappingURL=groups.js.map