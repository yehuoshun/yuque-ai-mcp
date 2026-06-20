/**
 * kv/delete — 增量删除 namespace 中的一个 key
 *
 * 端点到语雀：GET /repos/{book_id}/docs/{doc_id}（逐个分片查找）+ PUT
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { kvIncrementalDelete } from "./common.js";

export const kvDelete: McpTool = {
  name: "yuque_kv_delete",
  description: "Delete a key from a KV namespace. 需指定 domain（rss/crawler）定位 kv_slugs。详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Domain: 'rss' or 'crawler'. Locates kv_slugs in config." },
      namespace: { type: "string", description: "KV namespace key. Matches config.json rss/crawler namespaces." },
      key: { type: "string", description: "Key to delete" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["domain", "namespace", "key"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.domain, "domain"),
      requiredString(args?.namespace, "namespace"),
      requiredString(args?.key, "key"),
    );
    if (__v) return __v;

    const domain = args?.domain as "rss" | "crawler";
    const namespace = args?.namespace as string;
    const key = args?.key as string;

    const result = await kvIncrementalDelete(domain, namespace, key);
    if (!result.ok) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_DELETE_FAILED",
          message: result.error,
        }, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          domain,
          namespace,
          key,
          action: "deleted",
          shards: result.shards,
        }, null, 2),
      }],
    };
  },
};