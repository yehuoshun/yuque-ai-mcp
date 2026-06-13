/**
 * repo/update — 更新知识库
 *
 * 端点：PUT /api/v2/repos/:book_id
 * 职责：更新知识库名称/路径/简介/公开性，支持通过 toc 字段批量更新目录
 *
 * toc 字段格式为 Markdown 目录：[名称](文档路径)
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatRepo, wrapResult } from "../common/format.js";


export const repoUpdate: McpTool = {
  name: "yuque_update_repo",
  description: "Update repository info (book_id supports numeric ID or namespace, all body fields optional, toc field supports batch TOC update)",

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
    const cfg = loadConfig();
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;

    const payload: Record<string, unknown> = {};
    if (args?.name !== undefined) payload.name = args.name;
    if (args?.slug !== undefined) payload.slug = args.slug;
    if (args?.description !== undefined) payload.description = args.description;
    if (args?.public !== undefined) payload.public = args.public;
    if (args?.toc !== undefined) payload.toc = args.toc;

    const url = `${cfg.api_base}/repos/${bookId}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新知识库");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: wrapResult(data, formatRepo, raw) }],
    };
  },
};