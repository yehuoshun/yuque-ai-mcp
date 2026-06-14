/**
 * doc/copy-doc — 单文档跨知识库复制
 *
 * Agent 清洗内容后传入 title/body/format/paths，工具建目录+创建文档
 */

import type { McpTool } from "../common/types.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath, appendSourceLink } from "./copy-common.js";

export const docCopySingle: McpTool = {
  name: "yuque_copy_doc",
  description:
    "Copy a single document to another repository. Agent provides cleaned content (title/body/format/paths). Tool creates TOC directories and copies under each path.",

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
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
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
    const raw = args?.raw as boolean | undefined;

    // 校验必填
    for (const [val, name] of [[targetBookId, "target_book_id"], [title, "title"], [body, "body"], [format, "format"], [args?.paths, "paths"]] as const) {
      const err = requiredString(val as string, name);
      if (err) return err;
    }

    // 解析 paths
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
        const dirUuid = await ensureDirectoryPath(targetBookId, path);
        if (!dirUuid) {
          results.push({ path, error: "目录创建失败" });
          continue;
        }

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
        await apiPut(`/repos/${targetBookId}/toc`, {
          action: "appendNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: [newDoc.id],
          target_uuid: dirUuid,
        }, `Append doc to TOC: ${path}`);

        results.push({ path, doc_id: newDoc.id, slug: newDoc.slug });
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