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


export const docUpdate: McpTool = {
  name: "yuque_update_doc",
  description: "更新语雀文档（book_id 支持 ID 或 namespace，id 支持文档 ID 或 slug，所有 body 参数可选）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      id: { type: "string", description: "文档 ID 或 slug（必填）" },
      title: { type: "string", description: "标题" },
      slug: { type: "string", description: "文档路径" },
      format: { type: "string", description: "内容格式：markdown / html / lake" },
      body: { type: "string", description: "正文内容" },
      public: { type: "number", description: "公开性：0=私密 / 1=公开 / 2=企业内公开" },
    },
    required: ["book_id", "id"],
  },

  async handler(args) {
    const cfg = loadConfig();
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
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};