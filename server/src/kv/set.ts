/**
 * kv/set — 增量设置 namespace 中的一个 key-value 对
 *
 * 端点到语雀：GET /repos/{repo}/docs/{lastNs} + PUT 或 POST（新分片）
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { resolveKvRepo, kvIncrementalSet } from "./common.js";

export const kvSet: McpTool = {
  name: "yuque_kv_set",
  description: "Set a key-value pair in a KV namespace. Incremental: reads only the last shard, updates if under 250KB, creates new shard if full. Used for dedup marking, config updates, etc. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      namespace: { type: "string", description: "KV namespace, e.g. 'cnblogs', 'weibo'." },
      key: { type: "string", description: "Key to set" },
      value: { type: "string", description: "Value to store" },
      repo: { type: "string", description: "KV repo ID or namespace. Optional — falls back to config.json kv.default_repo." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["namespace", "key", "value"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.namespace, "namespace"),
      requiredString(args?.key, "key"),
      requiredString(args?.value, "value"),
    );
    if (__v) return __v;

    const namespace = args?.namespace as string;
    const key = args?.key as string;
    const value = args?.value as string;
    const repo = (args?.repo as string) || resolveKvRepo();

    if (!repo) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_KV_REPO",
          message: "未配置 KV 知识库，请在 config.json 中设置 kv.default_repo 或传 repo 参数",
        }, null, 2) }],
        isError: true,
      };
    }

    const result = await kvIncrementalSet(repo, namespace, key, value);
    if (!result.ok) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_SET_FAILED",
          message: `KV 写入失败: ${result.error}`,
        }, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          namespace,
          key,
          value,
          shards: result.shards,
        }, null, 2),
      }],
    };
  },
};