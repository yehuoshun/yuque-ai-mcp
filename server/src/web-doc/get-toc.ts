/**
 * web-doc/get-toc — Cookie 态获取知识库目录
 *
 * 端点：GET /api/catalog_nodes?book_id={book_id}（Web API，Cookie 认证）
 * 职责：返回知识库完整目录树（扁平数组，通过 uuid 父子关系导航）
 *
 * 相比 v2 get_toc 的优势：
 *   - 不走 Token，不受会员过期限流
 *   - 返回结构相同，兼容现有 TOC 处理逻辑
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString } from "../common/validate.js";

const TOC_REFERER = "https://www.yuque.com/";

/**
 * 格式化 TOC 节点
 */
function formatTocItem(item: Record<string, unknown>) {
  return {
    uuid: item.uuid,
    type: item.type,
    title: item.title,
    url: item.url,
    doc_id: item.doc_id,
    slug: item.slug,
    level: item.level,
    depth: item.depth,
    open_window: item.open_window,
    visible: item.visible,
    prev_uuid: item.prev_uuid,
    sibling_uuid: item.sibling_uuid,
    child_uuid: item.child_uuid,
    parent_uuid: item.parent_uuid,
  };
}

export const webTocGet: McpTool = {
  name: "yuque_web_get_toc",
  description:
    "Cookie-based: Get repo TOC tree (flat array, navigable via uuid/parent_uuid/child_uuid). " +
    "Same structure as v2 get_toc, but no membership required. " +
    "GET /api/catalog_nodes?book_id={book_id}. " +
    "详见 references/api/toc_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID (numeric, required)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns trimmed fields)" },
    },
    required: ["book_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
    );
    if (__v) return __v;

    const bookId = Number(args?.book_id);
    const raw = args?.raw as boolean | undefined;

    if (!bookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "book_id 必须为有效数字 / book_id must be a valid number" }, null, 2) }],
        isError: true,
      };
    }

    const url = `https://www.yuque.com/api/catalog_nodes?book_id=${bookId}`;
    const result = await webRequest(url, { referer: TOC_REFERER });

    if (isErrorResult(result)) return result;

    const res = result as { data?: Array<Record<string, unknown>> };
    const items = res?.data ?? [];

    if (raw) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            total: items.length,
            book_id: bookId,
            data: items.map(formatTocItem),
          }, null, 2),
        },
      ],
    };
  },
};