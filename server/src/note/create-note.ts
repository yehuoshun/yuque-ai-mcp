import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString, optionalBoolean } from "../common/validate.js";
import { formatNote } from "../common/format.js";

/**
 * 上游 POST /notes 只回 note_url、不回 id，而 GET/PUT /notes/:id 都只吃数字 id，
 * 所以创建后立刻查一次列表把新建的那条（按正文摘要 + 时间窗）认出来，补回 id。
 */
async function resolveCreatedNote(
  body: string,
  startedAt: number,
): Promise<Record<string, unknown> | null> {
  const list = await apiGet("/notes", { limit: "5", page: "1" }, "Resolve created note");
  if (isErrorResult(list)) return null;
  const notes = ((list as { data?: { notes?: unknown[] } })?.data?.notes ?? []) as Array<Record<string, unknown>>;
  const probe = body.trim().slice(0, 20);
  if (probe) {
    for (const n of notes) {
      const abs = (n?.content as { abstract?: string } | undefined)?.abstract ?? "";
      if (abs.replace(/<[^>]*>/g, "").includes(probe)) return n;
    }
  }
  for (const n of notes) {
    const ts = Date.parse(String(n?.published_at ?? n?.created_at ?? ""));
    if (Number.isFinite(ts) && ts >= startedAt - 5000) return n;
  }
  return null;
}

export const noteCreate: McpTool = {
  name: "yuque_create_note",
  description: "Create a note (short memo). Returns note_url, plus id/slug when resolvable (upstream POST /notes only returns note_url, so id is looked up in the note list right after create). POST /notes. 详见 references/api/note_api.md",

  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "Note body content (required, plain text or Markdown)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["body"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.body, "body")
      || optionalBoolean(args?.raw, "raw");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const body = args?.body as string;

    const startedAt = Date.now();
    const data = await apiPost("/notes", { body }, "Create note");
    if (isErrorResult(data)) return data;

    const payload = ((data as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
    const noteUrl = (payload.note_url as string) || "";
    const resolved = await resolveCreatedNote(body, startedAt);
    const merged: Record<string, unknown> = { ...(resolved ?? {}), ...payload };
    if (noteUrl) merged.note_url = noteUrl;

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, data: merged }, null, 2) }],
      };
    }
    const summary: Record<string, unknown> = formatNote(merged as never);
    if (summary.id === undefined || summary.id === null) {
      summary.warning = "上游未返回 note id，且列表查询未能定位到新建小记；可用 yuque_list_notes 取最新一条的 id";
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};
