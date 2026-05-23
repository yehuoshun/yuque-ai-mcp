import { get, post, put } from "../client.js";

/**
 * 列出小记
 */
export async function listNotes(params: { page?: number; limit?: number; status?: number }): Promise<string> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const status = params.status ?? 0;
  const data = await get(`/notes?page=${page}&limit=${limit}&status=${status}`);

  const body = data as any;
  const raw = body.data || body;
  const notes = raw.notes || raw.pin_notes || [];
  if (!Array.isArray(notes) || notes.length === 0) return "暂无小记";

  const lines = notes.map((n: any) => `- [${n.title || "无标题"}](id=${n.id}) created=${(n.published_at || n.created_at || "").slice(0, 10)}`);
  return lines.join("\n");
}

/**
 * 获取小记详情
 */
export async function getNote(params: { note_id: number }): Promise<string> {
  const data = await get(`/notes/${params.note_id}`);
  const note = (data as any).data || data;
  const content = note.content?.source || note.content || "";
  return `# ${note.title || "无标题"}\n\n${content}`;
}

/**
 * 创建小记
 */
export async function createNote(params: { body: string }): Promise<string> {
  const data = await post("/notes", { body: params.body });
  const note = (data as any).data || data;
  return `✅ 小记已创建: ${note.note_url || note.slug || ""}`;
}

/**
 * 更新小记
 */
export async function updateNote(params: { note_id: number; body: string; title?: string }): Promise<string> {
  const payload: Record<string, any> = {
    source: params.body,
    html: `<p>${params.body}</p>`,
    abstract: params.body.substring(0, 200),
  };

  if (params.title) {
    payload.title = params.title;
  }

  await put(`/notes/${params.note_id}`, payload);
  return `✅ 小记已更新: id=${params.note_id}`;
}

/**
 * 删除小记（软删除 status=9）
 */
export async function deleteNote(params: { note_id: number }): Promise<string> {
  const origin = await get(`/notes/${params.note_id}`);
  const origNote = ((origin as any).data?.data || (origin as any).data || origin) as any;

  await put(`/notes/${params.note_id}`, {
    source: origNote.content?.source || origNote.source || "",
    html: origNote.content?.html || origNote.html || "",
    abstract: origNote.content?.abstract || origNote.abstract || "",
    status: 9,
  });

  return `✅ 小记已移入回收站: id=${params.note_id}`;
}

/**
 * 恢复小记（status=0）
 */
export async function restoreNote(params: { note_id: number }): Promise<string> {
  const origin = await get(`/notes/${params.note_id}`);
  const origNote = ((origin as any).data?.data || (origin as any).data || origin) as any;

  await put(`/notes/${params.note_id}`, {
    source: origNote.content?.source || origNote.source || "",
    html: origNote.content?.html || origNote.html || "",
    abstract: origNote.content?.abstract || origNote.abstract || "",
    status: 0,
  });

  return `✅ 小记已恢复: id=${params.note_id}`;
}