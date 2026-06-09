/**
 * doc/create — 创建文档
 *
 * 端点：POST /api/v2/repos/:book_id/docs 或 POST /api/v2/repos/:group_login/:book_slug/docs
 * 职责：在指定知识库中创建新文档
 *
 * 注意：创建后不会自动添加到目录，需调知识库目录更新接口
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const docCreate: McpTool = {
  name: "yuque_create_doc",
  description: "创建语雀文档（book_id 支持 ID 或 namespace，title 默认「无标题」，format 默认 markdown）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      title: { type: "string", description: "标题，默认「无标题」" },
      slug: { type: "string", description: "文档路径，不填则自动生成" },
      format: { type: "string", description: "内容格式：markdown / html / lake，默认 markdown" },
      body: { type: "string", description: "正文内容（必填）" },
      public: { type: "number", description: "公开性：0=私密 / 1=公开 / 2=企业内公开，默认继承知识库" },
    },
    required: ["book_id", "body"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;
    const title = (args?.title as string) ?? "无标题";
    const slug = args?.slug as string | undefined;
    const format = (args?.format as string) ?? "markdown";
    const body = args?.body as string;
    const isPublic = args?.public as number | undefined;

    const payload: Record<string, unknown> = { title, body, format };
    if (slug) payload.slug = slug;
    if (isPublic !== undefined) payload.public = isPublic;

    const url = `${YUQUE_API_BASE}/repos/${bookId}/docs`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "创建文档");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};