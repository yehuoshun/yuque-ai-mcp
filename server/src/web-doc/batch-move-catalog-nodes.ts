/**
 * web-doc/batch-move-catalog-nodes — Cookie 态批量移动目录节点
 *
 * 端点：PUT /api/catalog_nodes/batch（Web API，Cookie 认证）
 * 职责：将指定文档节点批量移动到目标目录分组下
 *
 * 相比 v2 的优势：
 *   - 不走 Token，不受会员过期限流
 *   - 与 web get/list 同一认证体系
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { check, requiredString } from "../common/validate.js";

const CATALOG_REFERER = "https://www.yuque.com/";

export const webBatchMoveCatalogNodes: McpTool = {
  name: "yuque_web_batch_move_catalog_nodes",
  description:
    "Cookie-based: Batch move document nodes to a target catalog node. " +
    "PUT /api/catalog_nodes/batch. " +
    "No membership required. " +
    "Moves the specified node_uuids under the target_uuid directory as children. " +
    "详见 references/api/catalog_api.md",

  inputSchema: {
    type: "object",
    properties: {
      node_uuids: {
        type: "string",
        description: "JSON array string of node UUIDs to move, e.g. '[\"uuid1\",\"uuid2\"]' (required)",
      },
      target_uuid: {
        type: "string",
        description: "Target catalog node UUID to move into (required)",
      },
      book_id: {
        type: "string",
        description: "Repository ID (numeric, required)",
      },
    },
    required: ["node_uuids", "target_uuid", "book_id"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.node_uuids, "node_uuids"),
      requiredString(args?.target_uuid, "target_uuid"),
      requiredString(args?.book_id, "book_id"),
    );
    if (__v) return __v;

    const bookId = Number(args?.book_id);
    if (!bookId) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "book_id 必须为有效数字 / book_id must be a valid number" }, null, 2) }],
        isError: true,
      };
    }

    // Parse node_uuids JSON array
    let nodeUuids: string[];
    try {
      const parsed = JSON.parse(args!.node_uuids as string);
      if (!Array.isArray(parsed) || !parsed.every((u: unknown) => typeof u === "string")) {
        throw new Error("not a string array");
      }
      nodeUuids = parsed;
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "node_uuids 必须是有效的 JSON 字符串数组 / node_uuids must be a valid JSON string array" }, null, 2) }],
        isError: true,
      };
    }

    if (nodeUuids.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "node_uuids 不能为空数组 / node_uuids cannot be empty" }, null, 2) }],
        isError: true,
      };
    }

    const url = "https://www.yuque.com/api/catalog_nodes/batch";
    const body = {
      batch_action: "batchMove",
      node_uuids: nodeUuids,
      target_uuid: args!.target_uuid as string,
      book_id: bookId,
      target_book_id: bookId,
      transfer_action: "prependChild",
      insert_to_catalog: true,
    };

    const result = await webRequest(url, {
      method: "PUT",
      body,
      referer: CATALOG_REFERER,
    });

    if (isErrorResult(result)) return result;

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: true,
        moved_count: nodeUuids.length,
        node_uuids: nodeUuids,
        target_uuid: args!.target_uuid,
        message: `成功将 ${nodeUuids.length} 个文档节点移动到目标目录下 / Successfully moved ${nodeUuids.length} document nodes to target catalog`,
      }, null, 2) }],
    };
  },
};