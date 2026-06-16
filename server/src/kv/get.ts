/**
 * kv/get — 读取 namespace 的完整 JSON map
 *
 * 端点到语雀：GET /repos/{book_id}/docs/{doc_id}（逐个分片）
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { loadKvMap } from "./common.js";

export const kvGet: McpTool = {
  name: "yuque_kv_get",
  description: "Get the full JSON key-value map for a namespace. Returns {key: value} object. Used for dedup checks, config storage, etc. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      namespace: { type: "string", description: "KV namespace, e.g. 'cnblogs', 'weibo'." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["namespace"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.namespace, "namespace"));
    if (__v) return __v;

    const namespace = args?.namespace as string;
    const ns = loadConfig().kv?.namespaces?.[namespace];

    if (!ns) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NAMESPACE_NOT_FOUND",
          message: `namespace '${namespace}' 未配置，请先在 config.json 中设置 kv.namespaces`,
        }, null, 2) }],
        isError: true,
      };
    }

    const map = await loadKvMap(namespace);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          namespace,
          book_id: ns.book_id,
          shards: ns.docs.length,
          count: Object.keys(map).length,
          data: map,
        }, null, 2),
      }],
    };
  },
};