/**
 * 公共格式化函数 — 对 API 原始响应做字段裁剪，减少 AI token 消耗
 *
 * 默认精简输出，传 raw=true 可获取全量原始 JSON
 */

import type { McpTool } from "./types.js";

// ── User ──────────────────────────────────────────────────────

export function formatUser(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    login: d.login,
    name: d.name,
    description: d.description,
    avatar_url: d.avatar_url,
    books_count: d.books_count,
    followers_count: d.followers_count,
  };
}

export function formatUserGroup(data: any) {
  return {
    id: data.id,
    login: data.login,
    name: data.name,
    description: data.description,
    avatar_url: data.avatar_url,
  };
}

// ── Doc ───────────────────────────────────────────────────────

export function formatDoc(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    format: d.format,
    public: d.public,
    word_count: d.word_count,
    body: d.body,
    body_html: d.body_html,
    description: d.description,
    book_id: d.book_id,
    user_id: d.user_id,
    created_at: d.created_at,
    updated_at: d.updated_at,
    ...(data?.data ? {} : {}), // 保持透传兼容
  };
}

export function formatDocSummary(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    format: d.format,
    public: d.public,
    word_count: d.word_count,
    updated_at: d.updated_at,
  };
}

export function formatDocVersion(data: any) {
  return {
    id: data.id,
    doc_id: data.doc_id,
    title: data.title,
    version: data.version,
    created_at: data.created_at,
    content_changed: data.content_changed,
  };
}

// ── Repo ──────────────────────────────────────────────────────

export function formatRepo(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    namespace: d.namespace,
    description: d.description,
    public: d.public,
    items_count: d.items_count,
    likes_count: d.likes_count,
    user_id: d.user_id,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

// ── Group ─────────────────────────────────────────────────────

export function formatGroupUser(data: any) {
  const u = data.user ?? data;
  return {
    id: u.id,
    login: u.login,
    name: u.name,
    role: data.role,
    avatar_url: u.avatar_url,
    created_at: data.created_at,
  };
}

// ── Note ──────────────────────────────────────────────────────

export function formatNote(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    content: d.content,
    word_count: d.word_count,
    public: d.public,
    book_id: d.book_id,
    created_at: d.created_at,
    updated_at: d.updated_at,
    note_url: d.note_url,
  };
}

export function formatNoteSummary(data: any) {
  const d = data?.data ?? data;
  return {
    id: d.id,
    slug: d.slug,
    word_count: d.word_count,
    updated_at: d.updated_at,
    abstract: (d.content?.abstract || "").replace(/<[^>]*>/g, "").substring(0, 200),
  };
}

// ── TOC ───────────────────────────────────────────────────────

export function formatToc(data: any[]) {
  return data.map((item: any) => ({
    title: item.title,
    uuid: item.uuid,
    doc_id: item.doc_id,
    level: item.level,
    visible: item.visible,
    url: item.url,
    child_uuid: item.child_uuid,
    parent_uuid: item.parent_uuid,
  }));
}

// ── Recycle ───────────────────────────────────────────────────

export function formatRecycle(data: any) {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    slug: data.slug,
    deleted_at: data.deleted_at,
    user_id: data.user_id,
    book_id: data.book_id,
  };
}

// ── 通用包装器 ────────────────────────────────────────────────

/**
 * 对工具返回做格式化包装：
 * - 默认调 formatFn 裁剪
 * - 如果用户传了 raw=true，透传原始 JSON
 */
export function wrapResult(
  data: unknown,
  formatFn?: (data: any) => unknown,
  raw?: boolean,
): string {
  if (raw) {
    return JSON.stringify(data, null, 2);
  }
  if (!formatFn) {
    return JSON.stringify(data, null, 2);
  }
  // 处理 { data: [...] } 列表结构
  const obj = data as any;
  if (obj?.data && Array.isArray(obj.data)) {
    const formatted = {
      ...(obj.meta ? { meta: obj.meta } : {}),
      data: obj.data.map(formatFn),
    };
    return JSON.stringify(formatted, null, 2);
  }
  // 处理 { data: {...} } 单个对象
  if (obj?.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return JSON.stringify(formatFn(obj.data), null, 2);
  }
  // 处理纯数组（formatToc 等直接处理数组的 format 函数）
  if (Array.isArray(data)) {
    // 判断数组元素结构：如果第一个元素有 user 字段（group user），用 map
    // 否则让 formatFn 自己处理整个数组
    return JSON.stringify(formatFn(data), null, 2);
  }
  // 处理纯对象
  return JSON.stringify(formatFn(data), null, 2);
}