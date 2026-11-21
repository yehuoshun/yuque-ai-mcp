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

/**
 * 回读目标库 TOC，确认节点真的落到目标目录下。
 * PUT /api/catalog_nodes/move 会「假成功」（HTTP 200 但节点没动，详见 references/api/web_doc_api.md），
 * 所以必须回读校验，不能把请求被接受当成移动完成。
 */
async function verifyNodeUnderTarget(
  bookId: string | number,
  nodeUuid: string,
  targetUuid: string | null,
): Promise<{ ok: boolean; found: boolean; observedParent: string | null; error?: string }> {
  // 写接口是最终一致的：立刻回读常拿到旧结构，实测会把成功移动误判成未生效。轮询 3 次。
  let last: { ok: boolean; found: boolean; observedParent: string | null; error?: string } = {
    ok: false, found: false, observedParent: null,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    const url = `https://www.yuque.com/api/catalog_nodes?book_id=${encodeURIComponent(bookId)}`;
    const result = await webRequest(url, { referer: MOVE_REFERER });
    if (isErrorResult(result)) {
      last = { ok: false, found: false, observedParent: null, error: "回读目标库 TOC 失败" };
      continue;
    }
    const nodes = ((result as { data?: Array<Record<string, unknown>> }).data) ?? [];
    const node = nodes.find((n) => n.uuid === nodeUuid);
    if (!node) { last = { ok: false, found: false, observedParent: null }; continue; }
    const parent = String(node.parent_uuid ?? "");
    if (parent === (targetUuid ?? "")) return { ok: true, found: true, observedParent: parent || null };
    last = { ok: false, found: true, observedParent: parent || null };
  }
  return last;
}

export const webMoveCatalogNode: McpTool = {
  name: "yuque_web_move_catalog_node",
  description:
    "Cookie-based: Move a single catalog node to a target catalog node / target repo. " +
    "PUT /api/catalog_nodes/move. " +
    "Supports cross-repo move (target_book_id may differ from book_id) and moving the whole subtree (with_children). " +
    "No membership required. " +
    "详见 references/api/web_doc_api.md",

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

    const verify = await verifyNodeUnderTarget(targetBookId, args!.node_uuid as string, targetUuid);
    if (!verify.ok) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          success: false,
          error: "MOVE_NOT_APPLIED",
          message: `接口返回成功，但回读 TOC 校验未通过：节点未出现在目标目录 ${targetUuid ?? "(根目录)"} 下 / Move not verified`,
          book_id: bookId,
          target_book_id: targetBookId,
          node_uuid: args!.node_uuid,
          target_uuid: targetUuid,
          node_found_in_target: verify.found,
          observed_parent_uuid: verify.observedParent,
        }, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: true,
        verified: true,
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
