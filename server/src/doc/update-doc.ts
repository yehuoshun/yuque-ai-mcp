/**
 * doc/update — 更新文档
 *
 * 端点：PUT /api/v2/repos/:book_id/docs/:id
 * 职责：更新指定文档的标题、正文、路径等，所有 body 参数可选
 */

import type { McpTool } from "../common/types.js";
import { apiPut, isErrorResult } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { formatDoc, handleApiCall } from "../common/format.js";


export const docUpdate: McpTool = {
  name: "yuque_update_doc",
  description: "Update a document title/body/slug/format/public. PUT /repos/:id/docs/:id. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      id: { type: "string", description: "Document ID or slug (required)" },
      title: { type: "string", description: "Title" },
      slug: { type: "string", description: "Document slug" },
      format: { type: "string", description: "Content format: markdown / html / lake" },
      body: { type: "string", description: "Document body content" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.id, "id"),
    );
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const id = args?.id as string;

    const payload: Record<string, unknown> = {};
    if (args?.title !== undefined) payload.title = args.title;
    if (args?.slug !== undefined) payload.slug = args.slug;
    if (args?.format !== undefined) payload.format = args.format;
    if (args?.body !== undefined) payload.body = args.body;
    if (args?.public !== undefined) payload.public = args.public;

    const data = await apiPut(`/repos/${bookId}/docs/${id}`, payload, "Update doc");
    return handleApiCall(data, formatDoc, raw);
  },
};