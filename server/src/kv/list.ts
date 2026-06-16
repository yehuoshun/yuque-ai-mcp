/**
 * kv/list — 列出所有已配置的 KV namespace（直接从 config 读取）
 */

import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

export const kvList: McpTool = {
  name: "yuque_kv_list",
  description: "List all configured KV namespaces from config.json. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: [],
  },

  async handler() {
    const cfg = loadConfig();
    const namespaces = cfg.kv?.namespaces || {};

    const list = Object.entries(namespaces).map(([name, ns]) => ({
      namespace: name,
      book_id: ns.book_id,
      shards: ns.docs.length,
      doc_ids: ns.docs,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          count: list.length,
          namespaces: list,
        }, null, 2),
      }],
    };
  },
};