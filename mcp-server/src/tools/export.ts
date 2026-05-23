import { get } from "../client.js";
import { loadConfig } from "../config.js";

/**
 * 导出单篇文档为 Markdown 内容
 */
export async function exportDoc(params: { book_id: number; doc_id: number }): Promise<string> {
  const data = await get(`/repos/${params.book_id}/docs/${params.doc_id}`);
  const doc = (data as any).data || data;
  return doc.body || doc.body_sheet || "";
}

/**
 * 批量导出知识库的文档列表
 */
export async function listDocsForExport(params: {
  book_id: number;
  offset?: number;
  limit?: number;
}): Promise<string> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;
  const data = await get(`/repos/${params.book_id}/docs?offset=${offset}&limit=${Math.min(limit, 100)}`);

  const docs = (data as any).data || data;
  if (!Array.isArray(docs) || docs.length === 0) return JSON.stringify([]);

  return JSON.stringify(
    docs.map((d: any) => ({ id: d.id, title: d.title, slug: d.slug })),
    null,
    2
  );
}