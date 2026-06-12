/**
 * doc/create — 创建文档
 *
 * 端点：POST /api/v2/repos/:book_id/docs 或 POST /api/v2/repos/:group_login/:book_slug/docs
 * 职责：在指定知识库中创建新文档，并自动追加到知识库目录末尾
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";
import { loadConfig } from "../common/config.js";
import { formatDoc, wrapResult } from "../common/format.js";

/** 创建文档后自动追加到 TOC 末尾 */
async function appendToToc(cfg: ReturnType<typeof loadConfig>, bookId: string, docId: number): Promise<string | null> {
  try {
    const tocPayload = JSON.stringify({
      action: "appendNode",
      action_mode: "child",
      target_uuid: "",
      type: "DOC",
      doc_ids: [docId],
    });
    const tocUrl = `${cfg.api_base}/repos/${bookId}/toc`;
    const res = await fetch(tocUrl, {
      method: "PUT",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: tocPayload,
    });
    if (!res.ok) {
      return `文档创建成功，但自动追加到目录失败（${res.status}）。请手动在语雀网页端调整目录。`;
    }
    return null;
  } catch {
    return "文档创建成功，但自动追加到目录时网络异常。请手动在语雀网页端调整目录。";
  }
}

export const docCreate: McpTool = {
  name: "yuque_create_doc",
  description: "创建语雀文档（book_id 支持 ID 或 namespace，title 默认「无标题」，format 默认 markdown，创建后自动追加到目录末尾）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID（数字）或 namespace（如 group/book_slug）（必填）" },
      title: { type: "string", description: "标题，默认「无标题」" },
      slug: { type: "string", description: "文档路径，不填则自动生成" },
      format: { type: "string", description: "内容格式：markdown / html / lake，默认 markdown" },
      body: { type: "string", description: "正文内容（必填）" },
      public: { type: "number", description: "公开性：0=私密 / 1=公开 / 2=企业内公开，默认继承知识库" },
      raw: { type: "boolean", description: "是否返回原始全量 JSON（默认 false，返回精简字段）" },
    },
    required: ["book_id", "body"],
  },

  async handler(args) {
    const cfg = loadConfig();
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

    const url = `${cfg.api_base}/repos/${bookId}/docs`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Auth-Token": cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "创建文档");

    const data = await res.json();
    const docId = data?.data?.id as number | undefined;

    // 自动追加到目录末尾
    const result: Array<{ type: "text"; text: string }> = [
      { type: "text" as const, text: wrapResult(data, formatDoc, raw) },
    ];

    if (docId) {
      const tocWarning = await appendToToc(cfg, bookId, docId);
      if (tocWarning) {
        result.push({ type: "text" as const, text: tocWarning });
      }
    }

    return { content: result };
  },
};