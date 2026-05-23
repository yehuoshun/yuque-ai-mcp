import { get, getRaw, post, put, del } from "../client.js";
import { loadConfig } from "../config.js";

/**
 * 列出知识库内的文档
 */
export async function listDocs(params: { book_id: number; offset?: number; limit?: number }): Promise<string> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;
  const data = await get(`/repos/${params.book_id}/docs?offset=${offset}&limit=${Math.min(limit, 100)}`);

  const docs = (data as any).data || data;
  if (!Array.isArray(docs) || docs.length === 0) return "暂无文档";

  const lines = docs.map((d: any) => `- [${d.title}](${d.slug}) id=${d.id}`);
  return lines.join("\n");
}

/**
 * 获取文档详情（Markdown）
 */
export async function getDoc(params: { book_id: number; doc_id: number; raw?: boolean }): Promise<string> {
  const raw = params.raw !== false;
  if (raw) {
    return await getRaw(`/repos/${params.book_id}/docs/${params.doc_id}`);
  }
  const data = await get(`/repos/${params.book_id}/docs/${params.doc_id}`);
  return JSON.stringify((data as any).data || data, null, 2);
}

/**
 * 创建文档（自动挂 TOC）
 */
export async function createDoc(params: {
  book_id: number;
  title: string;
  body: string;
  format?: "markdown" | "lake";
  slug?: string;
}): Promise<string> {
  const { default_book } = loadConfig();
  const bookId = params.book_id || default_book.book_id;
  if (!bookId) throw new Error("未指定 book_id 且未配置 default_book");

  const payload: Record<string, any> = {
    title: params.title,
    body: params.body,
    format: params.format || "markdown",
  };
  if (params.slug) payload.slug = params.slug;

  const data = await post(`/repos/${bookId}/docs`, payload);
  const doc = (data as any).data || data;
  const docId = doc.id;

  // 自动挂载到目录
  try {
    await put(`/repos/${bookId}/toc`, {
      action: "appendNode",
      action_mode: "sibling",
      type: "DOC",
      doc_ids: [docId],
    });
  } catch (e: any) {
    return `⚠️ 文档已创建 (id=${docId})，但挂载目录失败: ${e.message}`;
  }

  return `✅ 文档已创建: ${params.title} (id=${docId})`;
}

/**
 * 更新文档
 */
export async function updateDoc(params: {
  book_id: number;
  doc_id: number;
  title?: string;
  body?: string;
}): Promise<string> {
  const payload: Record<string, any> = {};
  if (params.title) payload.title = params.title;
  if (params.body !== undefined) payload.body = params.body;

  await put(`/repos/${params.book_id}/docs/${params.doc_id}`, payload);
  return `✅ 文档已更新: id=${params.doc_id}`;
}

/**
 * 删除文档
 */
export async function deleteDoc(params: { book_id: number; doc_id: number }): Promise<string> {
  await del(`/repos/${params.book_id}/docs/${params.doc_id}`);
  return `✅ 文档已删除: id=${params.doc_id}`;
}

// ---------- 版本 ----------

/**
 * 获取文档版本列表
 */
export async function listDocVersions(params: { doc_id: number }): Promise<string> {
  const data = await get(`/doc_versions?doc_id=${params.doc_id}`);
  const versions = (data as any).data || data;
  if (!Array.isArray(versions) || versions.length === 0) return "暂无版本记录";

  const lines = versions.map((v: any) =>
    `- v${v.id} — ${v.title || "无标题"} (${v.created_at || ""}) by ${v.user?.name || "未知"}`
  );
  return lines.join("\n");
}

/**
 * 获取文档版本详情
 */
export async function getDocVersion(params: { version_id: number }): Promise<string> {
  const data = await get(`/doc_versions/${params.version_id}`);
  const v = (data as any).data || data;
  return `# ${v.title || "无标题"}\n\n${v.body || v.body_draft || "(空内容)"}`;
}

// ---------- 目录（TOC）----------

/**
 * 列出知识库目录
 */
export async function listToc(params: { book_id: number }): Promise<string> {
  const data = await get(`/repos/${params.book_id}/toc`);
  const toc = (data as any).data || data;
  return JSON.stringify(toc, null, 2);
}

/**
 * 更新知识库目录
 * action: appendNode=尾插 prependNode=头插 editNode=编辑节点 removeNode=删除节点
 * action_mode: sibling=同级 child=子节点
 */
export async function updateToc(params: {
  book_id: number;
  action?: "appendNode" | "prependNode" | "editNode" | "removeNode";
  action_mode?: "sibling" | "child";
  type?: "DOC" | "TITLE" | "LINK";
  doc_ids?: number[];
  target_uuid?: string;
  title?: string;
}): Promise<string> {
  const payload: Record<string, any> = {
    action: params.action || "appendNode",
    action_mode: params.action_mode || "sibling",
    type: params.type || "DOC",
  };
  if (params.doc_ids) payload.doc_ids = params.doc_ids;
  if (params.target_uuid) payload.target_uuid = params.target_uuid;
  if (params.title) payload.title = params.title;

  await put(`/repos/${params.book_id}/toc`, payload);
  return `✅ 目录已更新 (action=${payload.action})`;
}

/**
 * 从目录中移除节点（不删除文档）
 */
export async function removeTocNode(params: {
  book_id: number;
  target_uuid: string;
}): Promise<string> {
  await put(`/repos/${params.book_id}/toc`, {
    action: "removeNode",
    target_uuid: params.target_uuid,
  });
  return `✅ 节点已从目录移除: ${params.target_uuid}`;
}