/**
 * doc/create — 创建文档
 *
 * 端点：POST /api/v2/repos/:book_id/docs
 * 职责：在指定知识库中创建新文档
 *
 * 注意：不再自动 appendNode 到 TOC。
 * 需要调整目录结构时，请使用 yuque_update_toc。
 * import_url / import_file 内部有自己的 appendNode 逻辑。
 */

import type { McpTool } from "../common/types.js";
import { apiPost } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { formatDoc, handleApiCall } from "../common/format.js";

export const docCreate: McpTool = {
  name: "yuque_create_doc",
  description: "Create a document in a repo. TOC 不做自动处理，需要调整目录请用 yuque_update_toc。POST /repos/:id/docs. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      title: { type: "string", description: "Title, defaults to 'Untitled'" },
      slug: { type: "string", description: "Document slug. Rule: kebab-case, lowercase, no special chars. Auto-generated if omitted." },
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

    const docId = (data as { data?: { id: number } })?.data?.id;

    return handleApiCall(data, formatDoc, raw);
  },
};