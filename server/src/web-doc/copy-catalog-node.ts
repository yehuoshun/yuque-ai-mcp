/**
 * web-doc/copy-catalog-node — Cookie 态复制目录节点（跨库复制，服务端重传附件）
 *
 * 端点：PUT /api/catalog_nodes/copy（Web API，Cookie 认证）
 * 职责：将目录节点（文档/目录）复制到目标目录/目标知识库下。
 *
 * 相比 move：
 *   - 源节点保留，目标库生成副本
 *   - 附件（文件/图片卡片）由服务端重新上传到目标库，卡片引用正确
 *   - 这是唯一能跨库保留文件卡片 (ne-card-file) 的途径
 *
 * 注意：node_uuid 必须是 web 目录 (/api/catalog_nodes) 里的节点 uuid，
 *   v2 TOC (/api/v2/repos/:id/toc) 的 uuid 可能对不上（两份数据不一致时）。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString, optionalString, optionalBoolean } from "../common/validate.js";

const COPY_REFERER = "https://www.yuque.com/";

export const webCopyCatalogNode: McpTool = {
  name: "yuque_web_copy_catalog_node",
  description:
    "Cookie-based: Copy a catalog node (doc or dir) to a target catalog node / target repo, server-side with attachment re-upload. " +
    "PUT /api/catalog_nodes/copy. " +
    "The source node is kept; a copy is created in the target repo and attachments re-uploaded there (preserves file cards). " +
    "node_uuid must be from the web catalog (/api/catalog_nodes), not the v2 TOC. " +
    "详见 references/api/catalog_api.md",

  inputSchema: {
    type: "object",
    properties: {
      book_id: {
        type: "string",
        description: "Source repository ID (numeric, required). The repo the node currently lives in.",
      },
      node_uuid: {
        type: "string",
        description: "Source catalog node UUID to copy (required). Must exist in the web catalog (/api/catalog_nodes).",
      },
      target_book_id: {
        type: "string",
        description: "Target repository ID (numeric, required). The repo to copy into.",
      },
      target_uuid: {
        type: "string",
        description: "Target catalog node UUID to copy into. Leave empty / null to copy to the root of the target repo.",
      },
      action: {
        type: "string",
        description: "Copy action. Default 'prependChild'. Common values: prependChild (as first child), appendChild (as last child).",
      },
      with_children: {
        type: "boolean",
        description: "Copy the whole subtree (all descendant nodes) together. Default false.",
      },
      insert_to_catalog: {
        type: "boolean",
        description: "Whether to insert into the catalog/TOC. Default true.",
      },
    },
    required: ["book_id", "node_uuid", "target_book_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.node_uuid, "node_uuid"),
      requiredString(args?.target_book_id, "target_book_id"),
      optionalString(args?.target_uuid, "target_uuid"),
      optionalString(args?.action, "action"),
      optionalBoolean(args?.with_children, "with_children"),
      optionalBoolean(args?.insert_to_catalog, "insert_to_catalog"),
    );
    if (__v) return __v;

    const bookId = Number(args?.book_id);
    const targetBookId = Number(args?.target_book_id);
    if (!bookId || !targetBookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "book_id 和 target_book_id 必须为有效数字 / book_id and target_book_id must be valid numbers" }, null, 2) }],
        isError: true,
      };
    }

    // target_uuid 留空 → null（复制到目标库根目录）
    const targetUuid = (args?.target_uuid as string | undefined)?.trim() || null;

    const body = {
      book_id: bookId,
      node_uuid: args!.node_uuid as string,
      target_uuid: targetUuid,
      action: (args?.action as string | undefined)?.trim() || "prependChild",
      target_book_id: targetBookId,
      with_children: (args?.with_children as boolean | undefined) ?? false,
      insert_to_catalog: (args?.insert_to_catalog as boolean | undefined) ?? true,
    };

    const url = "https://www.yuque.com/api/catalog_nodes/copy";
    const result = await webRequest(url, {
      method: "PUT",
      body,
      referer: COPY_REFERER,
    });

    if (isErrorResult(result)) return result;

    // copy 返回 { meta: { docIds: [...] }, data: [...] }
    let newDocIds: number[] = [];
    try {
      const r = result as { meta?: { docIds?: unknown[] }; data?: Array<{ doc_id?: unknown }> };
      if (Array.isArray(r?.meta?.docIds)) newDocIds = r.meta.docIds.map((x) => Number(x)).filter(Boolean);
      else if (Array.isArray(r?.data)) {
        const ids = r.data.map((n) => n?.doc_id).filter((x): x is unknown => x !== undefined && x !== null && x !== "");
        newDocIds = ids.map((x) => Number(x)).filter(Boolean);
      }
    } catch {
      newDocIds = [];
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: true,
        book_id: bookId,
        target_book_id: targetBookId,
        node_uuid: args!.node_uuid,
        target_uuid: targetUuid,
        action: body.action,
        with_children: body.with_children,
        new_doc_ids: newDocIds,
        message: "成功复制目录节点到目标知识库（附件已服务端重传） / Successfully copied catalog node (attachments re-uploaded)",
      }, null, 2) }],
    };
  },
};