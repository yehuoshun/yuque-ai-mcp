/**
 * kv/list — 列出所有已配置的 KV namespace（从 rss/crawler namespaces 汇总）
 */

import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";

export const kvList: McpTool = {
  name: "yuque_kv_list",
  description: "List all configured KV namespaces from config.json (rss + crawler). 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: [],
  },

  async handler() {
    const cfg = loadConfig();
    const list: Array<{ domain: string; namespace: string; book_id: number; kv_shards: number; kv_slugs: string[]; schedule_slugs: string[] }> = [];

    for (const domain of ["rss", "crawler"] as const) {
      const namespaces = cfg[domain]?.namespaces || {};
      for (const [name, ns] of Object.entries(namespaces)) {
        list.push({
          domain,
          namespace: name,
          book_id: ns.book_id,
          kv_shards: ns.kv_slugs?.length ?? 0,
          kv_slugs: ns.kv_slugs ?? [],
          schedule_slugs: ns.schedule_slugs ?? [],
        });
      }
    }

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