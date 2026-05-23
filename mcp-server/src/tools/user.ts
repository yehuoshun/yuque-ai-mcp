import { get } from "../client.js";

/**
 * 获取当前 Token 的用户详情
 */
export async function getUser(): Promise<string> {
  const data = await get("/user");
  const u = (data as any).data || data;
  return JSON.stringify({
    id: u.id,
    login: u.login,
    name: u.name,
    avatar_url: u.avatar_url,
    description: u.description,
    books_count: u.books_count,
    public_books_count: u.public_books_count,
    followers_count: u.followers_count,
    following_count: u.following_count,
    public: u.public,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }, null, 2);
}