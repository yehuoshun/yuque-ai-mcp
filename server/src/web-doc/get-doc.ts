/**
 * web-doc/get-doc — Cookie 态读文档正文
 *
 * 端点：GET /api/docs/{id}?book_id={book_id}（Web API，Cookie 认证）
 * 职责：返回文档完整内容（含 content/body 正文），支持 markdown/lake/lakesheet 格式
 *
 * 相比 v2 get_doc 的优势：
 *   - 不走 Token，不受会员过期限流（429）
 *   - 返回更丰富的字段（54 个 vs v2 的 ~30 个）
 *   - 含 abilities/joinToken/masterUser 等额外信息
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString } from "../common/validate.js";

const DOC_REFERER = "https://www.yuque.com/";

/**
 * 格式化文档详情，提取关键字段
 */
function formatDocDetail(data: Record<string, unknown>) {
  const body = (data.body as string) || "";
  const content = (data.content as string) || "";
  const bodyAsl = (data.body_asl as string) || "";
  const contentHtml = (data.content_html as string) || "";
  const format = (data.format as string) || "";

  // 根据 format 确定正文内容和类型
  // lake → content 字段是 HTML
  // lakesheet → body 字段是 JSON
  // markdown → body 字段是 Markdown
  let bodyContent = "";
  let bodyType = "none";
  if (content) {
    bodyContent = content;
    bodyType = "html";
  } else if (body) {
    bodyContent = body;
    bodyType = format === "lakesheet" ? "lake_json" : "raw";
  } else if (bodyAsl) {
    bodyContent = bodyAsl;
    bodyType = "asl";
  }

  return {
    id: data.id,
    type: data.type,
    sub_type: data.sub_type,
    slug: data.slug,
    title: data.title,
    format,
    body: bodyContent,
    body_type: bodyType,
    word_count: data.word_count,
    description: data.description,
    cover: data.cover,
    status: data.status,
    public: data.public,
    read_status: data.read_status,
    view_status: data.view_status,
    draft_version: data.draft_version,
    comments_count: data.comments_count,
    likes_count: data.likes_count,
    read_count: data.read_count,
    created_at: data.created_at,
    updated_at: data.updated_at,
    content_updated_at: data.content_updated_at,
    published_at: data.published_at,
    first_published_at: data.first_published_at,
    book: data.book
      ? { id: (data.book as Record<string, unknown>).id, name: (data.book as Record<string, unknown>).name, slug: (data.book as Record<string, unknown>).slug }
      : { id: data.book_id },
    user: data.user
      ? { id: (data.user as Record<string, unknown>).id, login: (data.user as Record<string, unknown>).login, name: (data.user as Record<string, unknown>).name }
      : { id: data.user_id },
    abilities: data.abilities,
  };
}

export const webDocGet: McpTool = {
  name: "yuque_web_get_doc",
  description:
    "Cookie-based: Get full document detail with body/content. " +
    "Supports markdown/lake/lakesheet formats. " +
    "Returns richer fields than v2 get_doc (54 fields including abilities, joinToken, etc.). " +
    "No membership required, no Token rate limiting. " +
    "GET /api/docs/{id}?book_id={book_id}. " +
    "详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Document ID (numeric, required)" },
      book_id: { type: "string", description: "Repository ID (numeric, required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id", "book_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.id, "id"),
      requiredString(args?.book_id, "book_id"),
    );
    if (__v) return __v;

    const id = Number(args?.id);
    const bookId = Number(args?.book_id);
    if (!id || !bookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "id 和 book_id 必须为有效数字 / id and book_id must be valid numbers" }, null, 2) }],
        isError: true,
      };
    }
    const raw = args?.raw as boolean | undefined;

    const url = `https://www.yuque.com/api/docs/${id}?book_id=${bookId}`;
    const result = await webRequest(url, { referer: DOC_REFERER });

    if (isErrorResult(result)) return result;

    const data = (result as { data?: Record<string, unknown> })?.data;
    if (!data) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NO_DATA" }, null, 2) }],
        isError: true,
      };
    }

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(formatDocDetail(data), null, 2) }],
    };
  },
};