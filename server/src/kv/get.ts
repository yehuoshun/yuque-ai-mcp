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
  description: "Get the full JSON key-value map for a namespace. 需指定 domain（rss/crawler）定位 kv_slugs。详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Domain: 'rss' or 'crawler'. Locates kv_slugs in config." },
      namespace: { type: "string", description: "KV namespace, e.g. 'cnblogs'." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["domain", "namespace"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.domain, "domain"),
      requiredString(args?.namespace, "namespace"),
    );
    if (__v) return __v;

    const domain = args?.domain as "rss" | "crawler";
    const namespace = args?.namespace as string;

    const slugs = loadConfig()[domain]?.namespaces?.[namespace]?.kv_slugs ?? [];

    if (slugs.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NAMESPACE_NOT_FOUND",
          message: `namespace '${namespace}' 未配置 kv_slugs，请先在 config.json 的 ${domain}.namespaces.${namespace} 中设置`,
        }, null, 2) }],
        isError: true,
      };
    }

    const map = await loadKvMap(domain, namespace);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          domain,
          namespace,
          shards: slugs.length,
          count: Object.keys(map).length,
          data: map,
        }, null, 2),
      }],
    };
  },
};