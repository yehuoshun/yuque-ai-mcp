/**
 * kv/get — 读取 namespace 的完整 JSON map
 *
 * 端点到语雀：GET /repos/{repo}/docs/{namespace}
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { resolveKvRepo, loadKvMap } from "./common.js";

export const kvGet: McpTool = {
  name: "yuque_kv_get",
  description: "Get the full JSON key-value map for a namespace. Returns {key: value} object. Used for dedup checks, config storage, etc. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      namespace: { type: "string", description: "KV namespace, e.g. 'cnblogs', 'weibo'. One namespace = one Yuque doc." },
      repo: { type: "string", description: "KV repo ID or namespace. Optional — falls back to config.json kv.default_repo." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["namespace"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.namespace, "namespace"));
    if (__v) return __v;

    const namespace = args?.namespace as string;
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

    const map = await loadKvMap(repo, namespace);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          namespace,
          repo,
          count: Object.keys(map).length,
          data: map,
        }, null, 2),
      }],
    };
  },
};
