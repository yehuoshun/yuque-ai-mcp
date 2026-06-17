/**
 * 公共格式化函数 — 对 API 原始响应做字段裁剪，减少 AI token 消耗
 *
 * 默认精简输出，传 raw=true 可获取全量原始 JSON
 */

// ── 类型定义 ──────────────────────────────────────────────────

/** 语雀用户原始数据 */
interface YuqueUserRaw {
  id: number;
  login: string;
  name: string;
  description?: string;
  avatar_url?: string;
  books_count?: number;
  followers_count?: number;
}

/** 语雀团队原始数据 */
interface YuqueGroupRaw {
  id: number;
  login: string;
  name: string;
  description?: string;
  avatar_url?: string;
}

/** 语雀文档原始数据 */
interface YuqueDocRaw {
  id: number;
  slug: string;
  title: string;
  format?: string;
  public?: number;
  word_count?: number;
  body?: string;
  body_html?: string;
  description?: string;
  book_id?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
}

/** 语雀文档版本原始数据 */
interface YuqueDocVersionRaw {
  id: number;
  doc_id: number;
  title: string;
  version: number;
  created_at?: string;
  content_changed?: boolean;
}

/** 语雀知识库原始数据 */
interface YuqueRepoRaw {
  id: number;
  slug: string;
  name: string;
  namespace?: string;
  description?: string;
  public?: number;
  items_count?: number;
  likes_count?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
}

/** 语雀团队成员原始数据 */
interface YuqueGroupUserRaw {
  id: number;
  login: string;
  name: string;
  role?: number;
  avatar_url?: string;
  created_at?: string;
  user?: YuqueUserRaw;
}

/** 语雀小记原始数据 */
interface YuqueNoteRaw {
  id: number;
  slug: string;
  title?: string;
  content?: string | { abstract?: string };
  word_count?: number;
  public?: number;
  book_id?: number;
  created_at?: string;
  updated_at?: string;
  note_url?: string;
}

/** 语雀 TOC 节点原始数据 */
interface YuqueTocNodeRaw {
  title: string;
  uuid: string;
  doc_id?: number;
  level?: number;
  visible?: boolean;
  url?: string;
  child_uuid?: string;
  parent_uuid?: string;
}

/** 语雀回收站项目原始数据 */
interface YuqueRecycleRaw {
  id: number;
  title: string;
  type?: string;
  slug?: string;
  deleted_at?: string;
  user_id?: number;
  book_id?: number;
}

/** 带 data 包装的 API 响应 */
interface ApiResponse<T> {
  data?: T;
  meta?: unknown;
}

// ── User ──────────────────────────────────────────────────────

export function formatUser(data: ApiResponse<YuqueUserRaw> | YuqueUserRaw) {
  const d = (data as ApiResponse<YuqueUserRaw>).data ?? (data as YuqueUserRaw);
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

export function formatUserGroup(data: YuqueGroupRaw) {
  return {
    id: data.id,
    login: data.login,
    name: data.name,
    description: data.description,
    avatar_url: data.avatar_url,
  };
}

// ── Doc ───────────────────────────────────────────────────────

export function formatDoc(data: ApiResponse<YuqueDocRaw> | YuqueDocRaw) {
  const d = (data as ApiResponse<YuqueDocRaw>).data ?? (data as YuqueDocRaw);
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
  };
}

export function formatDocSummary(data: ApiResponse<YuqueDocRaw> | YuqueDocRaw) {
  const d = (data as ApiResponse<YuqueDocRaw>).data ?? (data as YuqueDocRaw);
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

export function formatDocVersion(data: YuqueDocVersionRaw) {
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

export function formatRepo(data: ApiResponse<YuqueRepoRaw> | YuqueRepoRaw) {
  const d = (data as ApiResponse<YuqueRepoRaw>).data ?? (data as YuqueRepoRaw);
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

export function formatGroupUser(data: YuqueGroupUserRaw) {
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

export function formatNote(data: ApiResponse<YuqueNoteRaw> | YuqueNoteRaw) {
  const d = (data as ApiResponse<YuqueNoteRaw>).data ?? (data as YuqueNoteRaw);
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

export function formatNoteSummary(data: ApiResponse<YuqueNoteRaw> | YuqueNoteRaw) {
  const d = (data as ApiResponse<YuqueNoteRaw>).data ?? (data as YuqueNoteRaw);
  const abstract = typeof d.content === "object" && d.content?.abstract
    ? d.content.abstract.replace(/<[^>]*>/g, "").substring(0, 200)
    : "";
  return {
    id: d.id,
    slug: d.slug,
    word_count: d.word_count,
    updated_at: d.updated_at,
    abstract,
  };
}

// ── TOC ───────────────────────────────────────────────────────

export function formatToc(data: YuqueTocNodeRaw[]) {
  return data.map((item) => ({
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

export function formatRecycle(data: YuqueRecycleRaw) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapResult(
  data: unknown,
  formatFn?: (item: any) => unknown,
  raw?: boolean,
): string {
  if (raw) {
    return JSON.stringify(data, null, 2);
  }
  if (!formatFn) {
    return JSON.stringify(data, null, 2);
  }
  // 处理 { data: [...] } 列表结构
  const obj = data as Record<string, unknown>;
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
    return JSON.stringify(formatFn(data), null, 2);
  }
  // 处理纯对象
  return JSON.stringify(formatFn(data), null, 2);
}

/**
 * 统一处理 API 调用结果：检查错误 → 格式化 → 包装 content 返回
 * 消除 32 处 handler 末尾重复的 isErrorResult + wrapResult 模式。
 */
export function handleApiCall(
  data: unknown,
  formatFn: (item: any) => unknown,
  raw?: boolean,
): { content: Array<{ type: "text"; text: string }> } | { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (data && typeof data === "object" && "isError" in data && (data as any).isError) {
    return data as { content: Array<{ type: "text"; text: string }>; isError: true };
  }
  return {
    content: [{ type: "text" as const, text: wrapResult(data, formatFn, raw) }],
  };
}