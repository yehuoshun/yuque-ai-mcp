/**
 * doc/create — 创建文档
 *
 * 端点：POST /api/v2/repos/:book_id/docs
 * 职责：在指定知识库中创建新文档，可选挂载到 TOC 指定节点下
 *
 * ⚠️ 重要：appendNode 的 target_uuid 不传时从 payload 中去掉该字段，
 * 不能传空字符串 ""，否则语雀 API 可能清空整个目录结构。
 */

import type { McpTool } from "../common/types.js";
import { apiPost } from "../common/api-client.js";
import { check, requiredString, optionalBoolean, oneOf } from "../common/validate.js";
import { formatDoc, handleApiCall } from "../common/format.js";
import { appendDocToToc } from "../common/toc-cache.js";

export const docCreate: McpTool = {
  name: "yuque_create_doc",
  description: "Create a document in a repo. 传 parent_uuid 则挂到指定节点下，不传默认挂根目录。POST /repos/:id/docs. 详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric) or namespace like group/book_slug (required)" },
      title: { type: "string", description: "Title, defaults to 'Untitled'" },
      slug: { type: "string", description: "Document slug. Rule: kebab-case, lowercase, no special chars. Auto-generated if omitted." },
      format: { type: "string", description: "Content format: markdown / html / lake, defaults to markdown" },
      body: { type: "string", description: "Document body content (required)" },
      public: { type: "number", description: "Visibility: 0=private, 1=public, 2=team-public, defaults to repo setting" },
      parent_uuid: { type: "string", description: "TOC parent node UUID. 指定后新文档挂到该节点下。不传默认挂根目录。" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id", "body"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.body, "body"),
      oneOf(args?.format, "format", ["markdown", "html", "lake"]),
      oneOf(args?.public, "public", [0, 1, 2]),
      optionalBoolean(args?.raw, "raw"),
    );
    if (__v) return __v;
    const raw = args?.raw as boolean | undefined;
    const bookId = args?.book_id as string;
    const title = (args?.title as string) ?? "无标题";
    const slug = args?.slug as string | undefined;
    const format = (args?.format as string) ?? "markdown";
    const body = args?.body as string;
    const isPublic = args?.public as number | undefined;
    const parentUuid = args?.parent_uuid as string | undefined;

    const payload: Record<string, unknown> = { title, body, format };
    if (slug) payload.slug = slug;
    if (isPublic !== undefined) payload.public = isPublic;

    const data = await apiPost(`/repos/${bookId}/docs`, payload, "Create doc");

    const docId = (data as { data?: { id: number } })?.data?.id;

    const result = handleApiCall(data, formatDoc, raw);

    if (docId && !("isError" in result)) {
      const { warning } = await appendDocToToc(bookId, docId, parentUuid);
      if (warning) {
        return { ...result, content: [...result.content, { type: "text" as const, text: warning }] };
      }
    }

    return result;
  },
};