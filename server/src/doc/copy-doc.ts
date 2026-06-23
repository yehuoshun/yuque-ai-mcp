/**
 * doc/copy-doc — 单文档跨知识库复制
 *
 * 职责：Agent 提供清洗后的内容（title/body/format）→ 工具创建文档 + 追尾源链接 + 挂载 TOC
 *
 * 源文档拉取由 Agent 通过 yuque_get_doc 完成，本工具只负责写入。
 */

import type { McpTool } from "../common/types.js";
import { apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString, check } from "../common/validate.js";
import { ensureDirectoryPath, appendDocToToc } from "../common/toc-ops.js";
import { appendSourceLink } from "../common/copy-common.js";

export const docCopySingle: McpTool = {
  name: "yuque_copy_doc",
  description: "Copy a single document to another repo. Agent fetches source via yuque_get_doc, cleans content, then calls this tool with title/body/format/paths. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      title: {
        type: "string",
        description: "Document title (required)",
      },
      body: {
        type: "string",
        description: "Document body, cleaned by Agent (required)",
      },
      format: {
        type: "string",
        description: "Content format: markdown / lake / html (required)",
      },
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"Java/Spring\",\"Database/MySQL\"]'. 1-5 paths (required)",
      },
      source_url: {
        type: "string",
        description: "Source document URL, appended as footer link",
      },
      source_title: {
        type: "string",
        description: "Source document title for the footer link",
      },
    },
    required: ["target_book_id", "title", "body", "format", "paths"],
  },

  async handler(args) {
    const targetBookId = args?.target_book_id as string;
    const title = args?.title as string;
    let body = args?.body as string;
    const format = args?.format as string;
    const sourceUrl = args?.source_url as string | undefined;
    const sourceTitle = args?.source_title as string | undefined;

    // 校验必填
    const __v = check(
      requiredString(targetBookId, "target_book_id"),
      requiredString(title, "title"),
      requiredString(body, "body"),
      requiredString(format, "format"),
    );
    if (__v) return __v;

    // 解析 paths
    const pathsErr = requiredString(args?.paths as string, "paths");
    if (pathsErr) return pathsErr;

    let paths: string[];
    try {
      paths = JSON.parse(args?.paths as string) as string[];
      if (!Array.isArray(paths) || paths.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_PATHS", message: "paths 必须是非空 JSON 数组" }, null, 2) }],
          isError: true,
        };
      }
      paths = paths.slice(0, 5);
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_PATHS", message: "paths 必须是有效的 JSON 数组" }, null, 2) }],
        isError: true,
      };
    }

    // 追尾源链接
    if (sourceUrl) {
      body = appendSourceLink(body, sourceUrl, sourceTitle || "原文档");
    }

    // 逐路径创建副本
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        const dirResult = await ensureDirectoryPath(targetBookId, path);
        if (!dirResult.uuid) {
          results.push({ path, error: dirResult.error || "目录创建失败" });
          continue;
        }
        const dirUuid = dirResult.uuid;

        const payload: Record<string, unknown> = { title, body, format };
        const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc to ${path}`);
        if (isErrorResult(data)) {
          const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
          results.push({ path, error: errMsg });
          continue;
        }

        const newDoc = (data as { data?: { id: number; slug: string } }).data;
        if (!newDoc?.id) {
          results.push({ path, error: "文档创建返回无 ID" });
          continue;
        }

        // 挂到目录节点下
        const { warning } = await appendDocToToc(targetBookId, newDoc.id, dirUuid);
        results.push({ path, doc_id: newDoc.id, slug: newDoc.slug, ...(warning ? { warning } : {}) });
      } catch (err) {
        results.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const summary = {
      title,
      target_book_id: targetBookId,
      paths,
      results,
      total: results.length,
      success: results.filter((r) => r.doc_id).length,
      failed: results.filter((r) => r.error).length,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};
