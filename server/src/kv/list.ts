/**
 * kv/list — 列出 KV 知识库中所有 namespace（文档）
 *
 * 端点到语雀：GET /repos/{repo}/docs
 */

import type { McpTool } from "../common/types.js";
import { resolveKvRepo } from "./common.js";
import { apiGet, isErrorResult } from "../common/api-client.js";

export const kvList: McpTool = {
  name: "yuque_kv_list",
  description: "List all KV namespaces (docs) in the KV repo. Each namespace is a Yuque doc whose body is a JSON key-value map. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "KV repo ID or namespace. Optional — falls back to config.json kv.default_repo." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: [],
  },

  async handler(args) {
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

    const data = await apiGet(`/repos/${repo}/docs`, undefined, "KV list");
    if (isErrorResult(data)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_LIST_FAILED",
          message: "获取 KV 命名空间列表失败",
        }, null, 2) }],
        isError: true,
      };
    }

    const docs = (data as { data?: Array<{ id: number; slug: string; title: string; updated_at: string }> })?.data || [];
    const namespaces = docs.map((d) => ({
      namespace: d.slug,
      title: d.title,
      updated_at: d.updated_at,
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          repo,
          count: namespaces.length,
          namespaces,
        }, null, 2),
      }],
    };
  },
};