/**
 * repo/update — 更新知识库
 *
 * 端点：PUT /api/v2/repos/:book_id
 * 职责：更新知识库名称/路径/简介/公开性，支持通过 toc 字段批量更新目录
 */

import type { McpTool } from "../common/types.js";
import { apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoUpdate: McpTool = {
  name: "yuque_update_repo",
  description: "Update repo name/description/slug/public. PUT /repos/:id. 详见 references/api/repo_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      name: { type: "string", description: "Name" },
      slug: { type: "string", description: "Slug" },
      description: { type: "string", description: "Description" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public" },
      toc: { type: "string", description: "TOC in Markdown format: [Title](doc-slug), supports batch TOC update" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.book_id, "book_id");
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const payload: Record<string, unknown> = {};
    if (args?.name !== undefined) payload.name = args.name;
    if (args?.slug !== undefined) payload.slug = args.slug;
    if (args?.description !== undefined) payload.description = args.description;
    if (args?.public !== undefined) payload.public = args.public;
    if (args?.toc !== undefined) payload.toc = args.toc;

    const data = await apiPut(`/repos/${bookId}`, payload, "Update repo");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};