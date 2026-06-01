import { loadConfig } from "../../config.js";
import type { YuqueConfig } from "../../config.js";

/** 通用的 headers（Cookie 登录态） */
function webHeaders(config: YuqueConfig): Record<string, string> {
  return {
    Accept: "application/json",
    Cookie: config.cookie || "",
    "x-csrf-token": config.ctoken || "",
    Referer: "https://www.yuque.com/dashboard/books",
    "User-Agent": "Mozilla/5.0",
  };
}

/** 检查 Cookie 登录态 */
function requireCookie(config: YuqueConfig): string | null {
  if (!config.cookie || !config.ctoken) {
    return JSON.stringify({
      error: "MISSING_COOKIE",
      message: "book_stacks 需要 Cookie 登录态。请在 config/yuque-config.json 中配置 cookie 和 ctoken。",
    });
  }
  return null;
}

/**
 * 列出知识库分组（仪表盘视图）
 * GET https://www.yuque.com/api/mine/book_stacks
 */
export async function listBookStacks(): Promise<string> {
  const config = loadConfig();
  const err = requireCookie(config);
  if (err) return err;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("https://www.yuque.com/api/mine/book_stacks", {
      method: "GET",
      headers: webHeaders(config),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ error: "FETCH_FAILED", status: res.status, message: text.slice(0, 300) });
    }
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({ error: "NETWORK_ERROR", message: e.message || String(e) });
  }
}

/**
 * 创建知识库分组
 * POST https://www.yuque.com/api/mine/book_stack
 */
export async function createBookStack(args: { name: string; target_rank?: number }): Promise<string> {
  const config = loadConfig();
  const err = requireCookie(config);
  if (err) return err;

  if (!args.name) {
    return JSON.stringify({ error: "INVALID_PARAMS", message: "name 必填" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("https://www.yuque.com/api/mine/book_stack", {
      method: "POST",
      headers: { ...webHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ name: args.name, target_rank: args.target_rank ?? 0 }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ error: "CREATE_FAILED", status: res.status, message: text.slice(0, 300) });
    }
    return JSON.stringify({ success: true, data: JSON.parse(text) });
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({ error: "NETWORK_ERROR", message: e.message || String(e) });
  }
}

/**
 * 更新知识库分组（改名）
 * PUT https://www.yuque.com/api/book_stacks/{stack_id}
 */
export async function updateBookStack(args: { stack_id: number; name: string }): Promise<string> {
  const config = loadConfig();
  const err = requireCookie(config);
  if (err) return err;

  if (!args.stack_id || !args.name) {
    return JSON.stringify({ error: "INVALID_PARAMS", message: "stack_id 和 name 必填" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`https://www.yuque.com/api/book_stacks/${args.stack_id}`, {
      method: "PUT",
      headers: { ...webHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ name: args.name, type: "user_books" }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ error: "UPDATE_FAILED", status: res.status, message: text.slice(0, 300) });
    }
    return JSON.stringify({ success: true, data: JSON.parse(text) });
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({ error: "NETWORK_ERROR", message: e.message || String(e) });
  }
}

/**
 * 排序知识库分组
 * PUT https://www.yuque.com/api/book_stacks/{stack_id}/sort
 */
export async function sortBookStacks(args: { stack_id: number; target_rank: number }): Promise<string> {
  const config = loadConfig();
  const err = requireCookie(config);
  if (err) return err;

  if (!args.stack_id) {
    return JSON.stringify({ error: "INVALID_PARAMS", message: "stack_id 必填" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`https://www.yuque.com/api/book_stacks/${args.stack_id}/sort`, {
      method: "PUT",
      headers: { ...webHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({ target_rank: args.target_rank ?? 0, handle_default: true }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ error: "SORT_FAILED", status: res.status, message: text.slice(0, 300) });
    }
    return JSON.stringify({ success: true, data: JSON.parse(text) });
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({ error: "NETWORK_ERROR", message: e.message || String(e) });
  }
}

/**
 * 移动知识库到指定分组
 * PUT https://www.yuque.com/api/mine/book_stack/move
 */
export async function moveBooks(args: {
  targetStackId: number;
  sourceStackId: number;
  sourceBookIds: number[];
  targetBookIds?: number[];
}): Promise<string> {
  const config = loadConfig();
  const err = requireCookie(config);
  if (err) return err;

  if (!args.targetStackId || args.sourceStackId === undefined || !args.sourceBookIds?.length) {
    return JSON.stringify({
      error: "INVALID_PARAMS",
      message: "targetStackId、sourceStackId、sourceBookIds 必填",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch("https://www.yuque.com/api/mine/book_stack/move", {
      method: "PUT",
      headers: { ...webHeaders(config), "Content-Type": "application/json" },
      body: JSON.stringify({
        targetStackId: args.targetStackId,
        sourceStackId: args.sourceStackId,
        sourceBookIds: args.sourceBookIds,
        targetBookIds: args.targetBookIds ?? [],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      return JSON.stringify({ error: "MOVE_FAILED", status: res.status, message: text.slice(0, 300) });
    }
    return JSON.stringify({ success: true, data: JSON.parse(text) });
  } catch (e: any) {
    clearTimeout(timer);
    return JSON.stringify({ error: "NETWORK_ERROR", message: e.message || String(e) });
  }
}