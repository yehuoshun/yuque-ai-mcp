/**
 * toc/update — 更新知识库目录
 *
 * 端点：PUT /api/v2/repos/:book_id/toc
 * 职责：创建/移动/编辑/删除目录节点
 *
 * 场景说明：
 *   创建文档节点 → action=appendNode, type=DOC, doc_ids=[...]
 *   创建分组节点 → action=appendNode, type=TITLE, title=...
 *   创建外链节点 → action=appendNode, type=LINK, title=..., url=...
 *   移动节点     → action=appendNode/prependNode, node_uuid=..., target_uuid=...
 *   编辑节点     → action=editNode, node_uuid=...
 *   删除节点     → action=removeNode, node_uuid=... (action_mode=sibling 删当前, child 删含子节点)
 */

import type { McpTool } from "../common/types.js";
import { handleApiError } from "../common/errors.js";

const YUQUE_API_BASE = process.env.YUQUE_API_BASE || "https://www.yuque.com/api/v2";
const YUQUE_TOKEN = process.env.YUQUE_TOKEN || "";

export const tocUpdate: McpTool = {
  name: "yuque_update_toc",
  description: "更新知识库目录：创建/移动/编辑/删除节点（不同 action 需不同字段搭配，详见参数说明）",

  inputSchema: {
    type: "object",
    properties: {
      book_id: { type: "string", description: "知识库 ID 或 namespace（必填）" },
      action: { type: "string", description: "操作类型（必填）：appendNode=尾插 / prependNode=头插 / editNode=编辑 / removeNode=删除" },
      action_mode: { type: "string", description: "操作模式（必填）：sibling=同级 / child=子级" },
      type: { type: "string", description: "节点类型：DOC=文档 / LINK=外链 / TITLE=分组（创建必填，编辑选填）" },
      doc_ids: { type: "string", description: "文档 ID 数组，JSON 格式如 [123,456]（创建文档节点必填）" },
      title: { type: "string", description: "节点名称（创建分组/外链必填，编辑选填）" },
      url: { type: "string", description: "节点 URL（创建外链必填，编辑选填）" },
      open_window: { type: "number", description: "是否新窗口打开：0=当前页 / 1=新窗口（外链选填，默认 0）" },
      visible: { type: "number", description: "是否可见：0=隐藏 / 1=可见（默认 1）" },
      target_uuid: { type: "string", description: "目标节点 UUID，不填默认根节点" },
      node_uuid: { type: "string", description: "操作节点 UUID（移动/编辑/删除必填）" },
    },
    required: ["book_id", "action", "action_mode"],
  },

  async handler(args) {
    const bookId = args?.book_id as string;

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
      try {
        payload.doc_ids = JSON.parse(args.doc_ids as string);
      } catch {
        // 如果解析失败，直接传字符串
        payload.doc_ids = args.doc_ids;
      }
    }

    const url = `${YUQUE_API_BASE}/repos/${bookId}/toc`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Auth-Token": YUQUE_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return handleApiError(res, "更新目录");

    const data = await res.json();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  },
};