import { get } from "../client.js";

/**
 * 团队整体统计
 */
export async function getGroupStats(params: { login: string }): Promise<string> {
  const data = await get(`/groups/${params.login}/statistics`);
  const s = (data as any).data || data;
  return JSON.stringify(s, null, 2);
}

/**
 * 团队成员统计
 */
export async function getMemberStats(params: {
  login: string;
  name?: string;
  range?: 0 | 30 | 365;
  page?: number;
  limit?: number;
  sortField?: "write_doc_count" | "write_count" | "read_count" | "like_count";
  sortOrder?: "desc" | "asc";
}): Promise<string> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 10, 20);
  let url = `/groups/${params.login}/statistics/members?page=${page}&limit=${limit}`;
  if (params.name) url += `&name=${encodeURIComponent(params.name)}`;
  if (params.range !== undefined) url += `&range=${params.range}`;
  if (params.sortField) url += `&sortField=${params.sortField}`;
  if (params.sortOrder) url += `&sortOrder=${params.sortOrder}`;

  const data = await get(url);
  return JSON.stringify((data as any).data || data, null, 2);
}

/**
 * 团队知识库统计
 */
export async function getBookStats(params: {
  login: string;
  name?: string;
  range?: 0 | 30 | 365;
  page?: number;
  limit?: number;
  sortField?: "content_updated_at_ms" | "word_count" | "post_count" | "read_count" | "like_count" | "watch_count" | "comment_count";
  sortOrder?: "desc" | "asc";
}): Promise<string> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 10, 20);
  let url = `/groups/${params.login}/statistics/books?page=${page}&limit=${limit}`;
  if (params.name) url += `&name=${encodeURIComponent(params.name)}`;
  if (params.range !== undefined) url += `&range=${params.range}`;
  if (params.sortField) url += `&sortField=${params.sortField}`;
  if (params.sortOrder) url += `&sortOrder=${params.sortOrder}`;

  const data = await get(url);
  return JSON.stringify((data as any).data || data, null, 2);
}

/**
 * 团队文档统计
 */
export async function getDocStats(params: {
  login: string;
  bookId?: number;
  name?: string;
  range?: 0 | 30 | 365;
  page?: number;
  limit?: number;
  sortField?: "content_updated_at" | "word_count" | "read_count" | "like_count" | "comment_count" | "created_at";
  sortOrder?: "desc" | "asc";
}): Promise<string> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 10, 20);
  let url = `/groups/${params.login}/statistics/docs?page=${page}&limit=${limit}`;
  if (params.bookId) url += `&bookId=${params.bookId}`;
  if (params.name) url += `&name=${encodeURIComponent(params.name)}`;
  if (params.range !== undefined) url += `&range=${params.range}`;
  if (params.sortField) url += `&sortField=${params.sortField}`;
  if (params.sortOrder) url += `&sortOrder=${params.sortOrder}`;

  const data = await get(url);
  return JSON.stringify((data as any).data || data, null, 2);
}