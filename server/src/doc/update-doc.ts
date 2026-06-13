/**
 * doc/update — 更新文档
 *
 * 端点：PUT /api/v2/repos/:book_id/docs/:id
 * 职责：更新指定文档的标题、正文、路径等
 *
 * 所有 body 参数可选，只传需要更新的字段
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatDoc, wrapResult } from "../common/format.js";


export const docUpdate: McpTool = {
  name: "yuque_update_doc",
  description: "Update a document (book_id supports numeric ID or namespace, id supports numeric ID or slug, all body fields optional)",

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
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const id = args?.id as string;

    const payload: Record<string, unknown> = {};
    if (args?.title !== undefined) payload.title = args.title;
    if (args?.slug !== undefined) payload.slug = args.slug;
    if (args?.format !== undefined) payload.format = args.format;
    if (args?.body !== undefined) payload.body = args.body;
    if (args?.public !== undefined) payload.public = args.public;

    const url = `${cfg.api_base}/repos/${bookId}/docs/${id}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新文档");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatDoc, raw) }],
    };
  },
};