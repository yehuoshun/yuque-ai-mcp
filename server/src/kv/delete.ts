/**
 * kv/delete — 增量删除 namespace 中的一个 key
 *
 * 端点到语雀：GET /repos/{repo}/docs/{ns}（逐个分片查找）+ PUT
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { resolveKvRepo, kvIncrementalDelete } from "./common.js";

export const kvDelete: McpTool = {
  name: "yuque_kv_delete",
  description: "Delete a key from a KV namespace. Scans shards to find the key, updates that shard. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      namespace: { type: "string", description: "KV namespace, e.g. 'cnblogs', 'weibo'." },
      key: { type: "string", description: "Key to delete" },
      repo: { type: "string", description: "KV repo ID or namespace. Optional — falls back to config.json kv.default_repo." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["namespace", "key"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.namespace, "namespace"),
      requiredString(args?.key, "key"),
    );
    if (__v) return __v;

    const namespace = args?.namespace as string;
    const key = args?.key as string;
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

    const result = await kvIncrementalDelete(repo, namespace, key);
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
          namespace,
          key,
          action: "deleted",
          shards: result.shards,
        }, null, 2),
      }],
    };
  },
};