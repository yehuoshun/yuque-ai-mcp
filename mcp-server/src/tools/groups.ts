import { get, put, del } from "../client.js";

/**
 * 列出群组成员
 */
export async function listGroupUsers(params: {
  login: string;
  role?: 0 | 1 | 2;
  offset?: number;
}): Promise<string> {
  const offset = params.offset ?? 0;
  let url = `/groups/${params.login}/users?offset=${offset}`;
  if (params.role !== undefined) url += `&role=${params.role}`;

  const data = await get(url);
  const users = (data as any).data || data;
  if (!Array.isArray(users) || users.length === 0) return "暂无成员";

  return JSON.stringify(users.map((u: any) => ({
    id: u.id,
    group_id: u.group_id,
    user_id: u.user_id,
    role: u.role,
    role_label: u.role === 0 ? "管理员" : u.role === 1 ? "成员" : "只读",
    user: u.user ? { id: u.user.id, login: u.user.login, name: u.user.name, avatar_url: u.user.avatar_url } : null,
    created_at: u.created_at,
  })), null, 2);
}

/**
 * 更新群组成员角色
 */
export async function updateGroupUser(params: {
  login: string;
  user_id: number;
  role: 0 | 1 | 2;
}): Promise<string> {
  await put(`/groups/${params.login}/users/${params.user_id}`, { role: params.role });
  const label = params.role === 0 ? "管理员" : params.role === 1 ? "成员" : "只读";
  return `✅ 成员角色已更新为 ${label}: user_id=${params.user_id}`;
}

/**
 * 移除群组成员
 */
export async function removeGroupUser(params: {
  login: string;
  user_id: number;
}): Promise<string> {
  await del(`/groups/${params.login}/users/${params.user_id}`);
  return `✅ 成员已移除: user_id=${params.user_id}`;
}