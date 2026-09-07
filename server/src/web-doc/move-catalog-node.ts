/**
 * web-doc/move-catalog-node — Cookie 态移动单个目录节点（支持跨库 + 带子树）
 *
 * 端点：PUT /api/catalog_nodes/move（Web API，Cookie 认证）
 * 职责：将单个目录节点移动到目标目录/目标知识库下。
 *
 * 相比 batch 版的优势：
 *   - 支持跨知识库移动（target_book_id 可 != book_id）
 *   - 支持 with_children 连带子节点整棵子树移动
 *   - 单节点语义，字段与原 web 端完全对齐
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString, optionalString, optionalBoolean } from "../common/validate.js";

const MOVE_REFERER = "https://www.yuque.com/";

export const webMoveCatalogNode: McpTool = {
  name: "yuque_web_move_catalog_node",
  description:
    "Cookie-based: Move a single catalog node to a target catalog node / target repo. " +
    "PUT /api/catalog_nodes/move. " +
    "Supports cross-repo move (target_book_id may differ from book_id) and moving the whole subtree (with_children). " +
    "No membership required. " +
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
        description: "Catalog node UUID to move (required).",
      },
      target_book_id: {
        type: "string",
        description: "Target repository ID (numeric). For cross-repo move set this to the destination repo. Defaults to book_id (same-repo move).",
      },
      target_uuid: {
        type: "string",
        description: "Target catalog node UUID to move into. Leave empty / null to move to the root of the target repo.",
      },
      action: {
        type: "string",
        description: "Move action. Default 'prependChild'. Common values: prependChild (as first child), appendChild (as last child).",
      },
      with_children: {
        type: "boolean",
        description: "Move the whole subtree (all descendant nodes) together. Default true.",
      },
      insert_to_catalog: {
        type: "boolean",
        description: "Whether to insert into the catalog/TOC. Default true.",
      },
    },
    required: ["book_id", "node_uuid"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.node_uuid, "node_uuid"),
      optionalString(args?.target_book_id, "target_book_id"),
      optionalString(args?.target_uuid, "target_uuid"),
      optionalString(args?.action, "action"),
      optionalBoolean(args?.with_children, "with_children"),
      optionalBoolean(args?.insert_to_catalog, "insert_to_catalog"),
    );
    if (__v) return __v;

    const bookId = Number(args?.book_id);
    if (!bookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "book_id 必须为有效数字 / book_id must be a valid number" }, null, 2) }],
        isError: true,
      };
    }

    // target_book_id 缺省 = book_id（同库移动）；填了则支持跨库
    const targetBookIdRaw = (args?.target_book_id as string | undefined)?.trim();
    const targetBookId = targetBookIdRaw ? Number(targetBookIdRaw) : bookId;
    if (!targetBookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "target_book_id 必须为有效数字 / target_book_id must be a valid number" }, null, 2) }],
        isError: true,
      };
    }

    // target_uuid 留空 → null（移动到目标库根目录）
    const targetUuid = (args?.target_uuid as string | undefined)?.trim() || null;

    const body = {
      book_id: bookId,
      node_uuid: args!.node_uuid as string,
      target_uuid: targetUuid,
      action: (args?.action as string | undefined)?.trim() || "prependChild",
      target_book_id: targetBookId,
      with_children: (args?.with_children as boolean | undefined) ?? true,
      insert_to_catalog: (args?.insert_to_catalog as boolean | undefined) ?? true,
    };

    const url = "https://www.yuque.com/api/catalog_nodes/move";
    const result = await webRequest(url, {
      method: "PUT",
      body,
      referer: MOVE_REFERER,
    });

    if (isErrorResult(result)) return result;

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: true,
        book_id: bookId,
        target_book_id: targetBookId,
        node_uuid: args!.node_uuid,
        target_uuid: targetUuid,
        action: body.action,
        with_children: body.with_children,
        cross_repo: targetBookId !== bookId,
        message: `成功移动目录节点到目标位置（${targetBookId !== bookId ? "跨库" : "同库"}） / Successfully moved catalog node (${targetBookId !== bookId ? "cross-repo" : "same-repo"})`,
      }, null, 2) }],
    };
  },
};
