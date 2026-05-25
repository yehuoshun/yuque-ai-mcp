import { loadConfig } from "../config.js";

const MINE_BASE = "https://www.yuque.com/api/mine/recycles";

/**
 * 发送语雀 Web API 请求（Cookie 认证，非 API Token）
 */
async function webRequest(
  url: string,
  opts: { method?: "GET" | "PUT" | "DELETE"; body?: unknown } = {}
): Promise<any> {
  const config = loadConfig();
  const cookie = config.cookie || "";
  const ctoken = config.ctoken || "";

  if (!cookie || !ctoken) {
    throw new Error(
      "回收站 API 需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken 字段。" +
      "获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken"
    );
  }

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cookie": cookie,
    "x-csrf-token": ctoken,
    "Referer": "https://www.yuque.com/dashboard/recycles",
    "User-Agent": "Mozilla/5.0",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
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
 * 列出回收站项目
 */
export async function listRecycles(params: {
  offset?: number;
  limit?: number;
  target_type?: "Doc" | "Note" | "Repo";
}): Promise<string> {
  const offset = params.offset ?? 0;
  const limit = Math.min(params.limit ?? 50, 100);
  let url = `${MINE_BASE}?offset=${offset}&limit=${limit}`;
  if (params.target_type) url += `&target_type=${params.target_type}`;

  const data = await webRequest(url);
  const items = data?.data?.data || [];
  const total = data?.data?.total ?? items.length;

  return JSON.stringify({
    total,
    offset,
    limit,
    items: items.map((r: any) => ({
      id: r.id,
      target_id: r.target_id,
      target_type: r.target_type,
      created_at: r.created_at,
      title: r.params?.doc?.title || r.params?.book?.name || "",
      slug: r.params?.doc?.slug || r.params?.book?.slug || "",
      book: r.params?.book ? {
        id: r.params.book.id,
        name: r.params.book.name,
        slug: r.params.book.slug,
      } : null,
      abilities: r.abilities,
    })),
  }, null, 2);
}

/**
 * 恢复回收站项目
 */
export async function restoreRecycle(params: {
  recycle_id: number;
}): Promise<string> {
  await webRequest(`${MINE_BASE}/${params.recycle_id}/restore`, { method: "PUT" });
  return JSON.stringify({ restored: true, recycle_id: params.recycle_id });
}

/**
 * 彻底删除回收站项目（不可恢复）
 */
export async function destroyRecycle(params: {
  recycle_id: number;
}): Promise<string> {
  await webRequest(`${MINE_BASE}/${params.recycle_id}`, { method: "DELETE" });
  return JSON.stringify({ destroyed: true, recycle_id: params.recycle_id });
}