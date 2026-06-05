import { get } from "../client.js";
import { loadConfig } from "../config.js";

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

/**
 * 健康检查：验证 Token 和知识库配置
 */
export async function healthCheck(): Promise<string> {
  const results: string[] = [];

  // 1. Token 验证
  try {
    const hello = await get("/hello");
    const user = (hello as any).data || hello;
    results.push(`✅ Token 有效 — 用户: ${user.login || user.name || "OK"}`);
  } catch (e: any) {
    if (e.statusCode === 401) {
      results.push("❌ Token 无效，请到 https://www.yuque.com/settings/tokens 重新生成");
    } else {
      results.push(`⚠️ Token 验证异常: ${e.message}`);
    }
  }

  // 2. 索引库检查
  try {
    const { route_book_sub } = await import("../config.js").then((m) => ({
      route_book_sub: m.loadConfig().route_book_sub,
    }));
    if (route_book_sub.length > 0) {
      for (const sb of route_book_sub) {
        await get(`/repos/${sb.book_id}`);
        results.push(`✅ 索引库: id=${sb.book_id} (${sb.namespace})`);
      }
    } else {
      results.push("⏭️ 未配置索引库");
    }
  } catch (e: any) {
    results.push(`❌ 索引库不可用: ${e.message}`);
  }

  // 3. 索引库检查
  try {
    const { route_book_sub } = await import("../config.js").then((m) => ({
      route_book_sub: m.loadConfig().route_book_sub,
    }));
    if (route_book_sub.length > 0) {
      results.push(`✅ 默认索引库: ${route_book_sub.length} 个`);
      for (const rs of route_book_sub) {
        await get(`/repos/${rs.book_id}`);
        results.push(`   ✅ ${rs.namespace} (id=${rs.book_id})`);
      }
    } else {
      results.push("⏭️ 未配置默认索引库 (route_book_sub)");
    }
  } catch (e: any) {
    results.push(`❌ 索引库不可用: ${e.message}`);
  }

  return results.join("\n");
}

// ---- 个人写作统计（Web API，Cookie 认证）----

/**
 * 发送语雀 Web API 请求（Cookie 认证）
 */
async function webRequest(url: string): Promise<any> {
  const config = loadConfig();
  const cookie = config.cookie || "";
  const ctoken = config.ctoken || "";

  if (!cookie || !ctoken) {
    throw new Error(
      "此 API 需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken 字段。"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": cookie,
        "x-csrf-token": ctoken,
        "Referer": "https://www.yuque.com/settings/stats",
        "User-Agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      try {
        const err = JSON.parse(text);
        throw new Error(`语雀 Web API 错误 [${res.status}]: ${err.message || text.slice(0, 200)}`);
      } catch (e: any) {
        if (e.message?.startsWith("语雀")) throw e;
        throw new Error(`语雀 Web API 错误 [${res.status}]: ${text.slice(0, 200)}`);
      }
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取个人写作统计仪表盘（editor_center）
 * ⚠️ Web API，需 Cookie 登录态
 */
export async function getUserStats(): Promise<string> {
  const raw = await webRequest("https://www.yuque.com/api/mine/editor_center");
  const d = raw.data || raw;

  return JSON.stringify({
    // 知识库
    books: {
      total: d.books_count,
      last_30d: d.books_count_30,
      last_365d: d.books_count_365,
    },
    // 文档
    docs: {
      total: d.docs_count,
      last_30d: d.docs_count_30,
      last_365d: d.docs_count_365,
      public: d.docs_public_count,
      public_last_30d: d.docs_public_count_30,
      public_last_365d: d.docs_public_count_365,
    },
    // 编辑活跃
    edits: {
      days_total: d.edit_days_all,
      days_last_30d: d.edit_days_30,
      days_last_365d: d.edit_days_365,
      docs_total: d.edit_doc_count_all,
      docs_last_30d: d.edit_doc_count_30,
      docs_last_365d: d.edit_doc_count_365,
      times_total: d.edit_times_all,
      times_last_30d: d.edit_times_30,
      times_last_365d: d.edit_times_365,
    },
    // 字数
    words: {
      total: d.word_count,
      last_30d: d.word_count_30,
      last_365d: d.word_count_365,
      max_book: d.max_word_book_info ? {
        name: d.max_word_book_info.name,
        items_count: d.max_word_book_info.items_count,
        word_count: d.max_word_count_book,
        book_id: d.max_word_count_book_id,
      } : null,
    },
    // 社交
    social: {
      likes_total: d.liked_count_all,
      likes_last_30d: d.liked_count_30,
      likes_last_365d: d.liked_count_365,
      public_doc_likes: d.public_doc_likes,
      interactive_users: (d.interactive_users || []).map((u: any) => ({
        name: u.name,
        login: u.login,
        avatar_url: u.avatar_url,
      })),
    },
    // 小记
    notes: {
      total: d.notes_count,
      last_30d: d.notes_count_30,
      last_365d: d.notes_count_365,
    },
    // 账号
    account: {
      platform_days: d.days,
    },
  }, null, 2);
}