/**
 * doc/create — 创建文档
 *
 * 端点：POST /api/v2/repos/:book_id/docs
 * 职责：在指定知识库中创建新文档，并自动追加到知识库目录末尾
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult, apiPost, apiPut } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { formatDoc, wrapResult } from "../common/format.js";

/** 创建文档后自动追加到 TOC 末尾 */
async function appendToToc(bookId: string, docId: number): Promise<string | null> {
  try {
    const payload = { action: "appendNode", action_mode: "child", target_uuid: "", type: "DOC", doc_ids: [docId] };
    const res = await apiPut(`/repos/${bookId}/toc`, payload, "Append to TOC");
    if (res && typeof res === "object" && "isError" in res) {
      return `文档创建成功，但自动追加到目录失败。请手动在语雀网页端调整目录。`;
    }
    return null;
  } catch {
    return "文档创建成功，但自动追加到目录时网络异常，请手动在语雀网页端调整目录 / Document created but network error during TOC append. Please manually adjust TOC in Yuque web UI.";
  }
}

export const docCreate: McpTool = {
  name: "yuque_create_doc",
  description: "Create a document in a repository. The doc is auto-appended to the TOC root; use yuque_update_toc to reposition it.",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      title: { type: "string", description: "Title, defaults to 'Untitled'" },
      slug: { type: "string", description: "Document slug, auto-generated if omitted" },
      format: { type: "string", description: "Content format: markdown / html / lake, defaults to markdown" },
      body: { type: "string", description: "Document body content (required)" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public, defaults to repo setting" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "body"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.body, "body"),
    );
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const title = (args?.title as string) ?? "无标题";
    const slug = args?.slug as string | undefined;
    const format = (args?.format as string) ?? "markdown";
    const body = args?.body as string;
    const isPublic = args?.public as number | undefined;

    const payload: Record<string, unknown> = { title, body, format };
    if (slug) payload.slug = slug;
    if (isPublic !== undefined) payload.public = isPublic;

    const data = await apiPost(`/repos/${bookId}/docs`, payload, "Create doc");
    if (isErrorResult(data)) return data;

    const docId = (data as { data?: { id: number } })?.data?.id;

    const result: Array<{ type: "text"; text: string }> = [
      { type: "text" as const, text: wrapResult(data, formatDoc, raw) },
    ];

    if (docId) {
      const tocWarning = await appendToToc(bookId, docId);
      if (tocWarning) result.push({ type: "text" as const, text: tocWarning });
    }

    return { content: result };
  },
};