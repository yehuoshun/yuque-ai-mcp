/**
 * web-doc/delete-doc — Cookie 态删除文档
 *
 * 端点：DELETE /api/docs/{id}?book_id={book_id}（Web API，Cookie 认证）
 * 职责：删除指定文档（移入回收站），v2 删除被限流时作为替代通道
 *
 * 相比 v2 delete_doc 的优势：
 *   - 不走 Token，不受会员过期限流（429）
 *   - 与 web get/list 同一认证体系，v2 挂掉时仍可删
 *
 * ⚠️ 删除不可逆（移入回收站，可恢复）。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString, optionalBoolean } from "../common/validate.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";

const DOC_REFERER = "https://www.yuque.com/";

export const webDocDelete: McpTool = {
  name: "yuque_web_delete_doc",
  description:
    "Cookie-based: Delete a document (moves to recycle bin). " +
    "DELETE /api/docs/{id}?book_id={book_id}. " +
    "No membership required, alternative to v2 delete_doc when Token is rate-limited/expired. " +
    "⚠️ Requires confirm='DELETE'. " +
    "详见 references/api/doc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Document ID (numeric, required)" },
      book_id: { type: "string", description: "Repository ID (numeric, required)" },
      confirm: confirmationParam.confirm,
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["id", "book_id", "confirm"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.id, "id"),
      requiredString(args?.book_id, "book_id"),
      optionalBoolean(args?.raw, "raw"),
    );
    if (__v) return __v;
    const confirmed = checkConfirmation(args);
    if (confirmed) return confirmed;

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
    const result = await webRequest(url, { method: "DELETE", referer: DOC_REFERER });

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
      content: [{ type: "text" as const, text: JSON.stringify({
        id: data.id,
        title: data.title,
        slug: data.slug,
        deleted: true,
        note: "移入回收站，可通过 yuque_list_recycles 查看 / yuque_restore_recycle 恢复",
      }, null, 2) }],
    };
  },
};