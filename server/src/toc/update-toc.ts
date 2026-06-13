/**
 * toc/update — 更新知识库目录
 *
 * 端点：PUT /api/v2/repos/:book_id/toc
 * 职责：创建/移动/编辑/删除目录节点
 */

import type { McpTool } from "../common/types.js";
import { confirmationParam, checkConfirmation } from "../common/errors.js";
import { check, requiredString } from "../common/validate.js";
import { apiPut, isErrorResult } from "../common/api-client.js";


export const tocUpdate: McpTool = {
  name: "yuque_update_toc",
  description: "Update repository TOC (create/move/edit/delete nodes). ⚠️ Deleting requires confirm='DELETE'",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "Repository ID or namespace (required)" },
      action: { type: "string", description: "Action type (required): appendNode, prependNode, editNode, removeNode" },
      action_mode: { type: "string", description: "Action mode (required): sibling, child" },
      type: { type: "string", description: "Node type: DOC, LINK, TITLE (required for create, optional for edit)" },
      doc_ids: { type: "string", description: "Document ID array as JSON, e.g. [123,456] (required for creating doc nodes)" },
      title: { type: "string", description: "Node title (required for creating group/link, optional for edit)" },
      url: { type: "string", description: "Node URL (required for creating link, optional for edit)" },
      open_window: { type: "number", description: "Open in new window: 0=same page, 1=new window (optional for links, default 0)" },
      visible: { type: "number", description: "Visible: 0=hidden, 1=visible (default 1)" },
      target_uuid: { type: "string", description: "Target node UUID, defaults to root if omitted" },
      node_uuid: { type: "string", description: "Target node UUID (required for move/edit/delete)" },
      confirm: confirmationParam.confirm,
    },
    required: ["book_id", "action", "action_mode"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.book_id, "book_id"),
      requiredString(args?.action, "action"),
      requiredString(args?.action_mode, "action_mode"),
    );
    if (__v) return __v;
    const bookId = args?.book_id as string;
    const action = args?.action as string;

    if (action === "removeNode") {
      const confirmed = checkConfirmation(args);
      if (confirmed) return confirmed;
    }

    const payload: Record<string, unknown> = {
      action: args?.action,
      action_mode: args?.action_mode,
    };

    if (args?.type !== undefined) payload.type = args.type;
    if (args?.title !== undefined) payload.title = args.title;
    if (args?.url !== undefined) payload.url = args.url;
    if (args?.open_window !== undefined) payload.open_window = args.open_window;
    if (args?.visible !== undefined) payload.visible = args.visible;
    if (args?.target_uuid !== undefined) payload.target_uuid = args.target_uuid;
    if (args?.node_uuid !== undefined) payload.node_uuid = args.node_uuid;
    if (args?.doc_ids !== undefined) {
      try { payload.doc_ids = JSON.parse(args.doc_ids as string); }
      catch { payload.doc_ids = args.doc_ids; }
    }

    const data = await apiPut(`/repos/${bookId}/toc`, payload, "Update TOC");
    if (isErrorResult(data)) return data;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};