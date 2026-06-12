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
  description: "更新知识库信息（book_id 支持 ID 或 namespace，所有 body 参数可选，toc 字段可批量更新目录）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      name: { type: "string", description: "名称" },
      slug: { type: "string", description: "路径" },
      description: { type: "string", description: "简介" },
      public: { type: "number", description: "公开性：0=私密 / 1=公开 / 2=企业内公开" },
      toc: { type: "string", description: "目录（Markdown 格式：[名称](文档路径)，可批量更新目录结构）" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
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