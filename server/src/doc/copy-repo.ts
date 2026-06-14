/**
 * doc/copy-repo — 批量跨知识库文档复制
 *
 * Agent 清洗内容后传入 documents 数组，工具串行建目录+创建文档
 */

import type { McpTool } from "../common/types.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath, appendSourceLink } from "./copy-common.js";

interface CopyDocument {
  title: string;
  body: string;
  format: string;
  paths: string[];
  source_url?: string;
  source_title?: string;
}

export const docCopyRepo: McpTool = {
  name: "yuque_copy_repo",
  description:
    "Batch copy documents to another repository. Agent provides cleaned documents array (title/body/format/paths for each). Tool creates TOC directories and copies.",

  inputSchema: {
    type: "object",
    properties: {
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      documents: {
        type: "string",
        description: "JSON array of {title, body, format, paths, source_url?, source_title?}. paths is array of 1-5 directory paths. (required)",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
      },
    },
    required: ["target_book_id", "documents"],
  },

  async handler(args) {
    const __v = requiredString(args?.target_book_id, "target_book_id");
    if (__v) return __v;
    const __v2 = requiredString(args?.documents, "documents");
    if (__v2) return __v2;

    const targetBookId = args?.target_book_id as string;
    const raw = args?.raw as boolean | undefined;

    let documents: CopyDocument[];
    try {
      documents = JSON.parse(args?.documents as string) as CopyDocument[];
      if (!Array.isArray(documents) || documents.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_DOCUMENTS", message: "documents 必须是非空 JSON 数组" }, null, 2) }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_DOCUMENTS", message: "documents 必须是有效的 JSON 数组" }, null, 2) }],
        isError: true,
      };
    }

    const details: Array<{
      title: string;
      paths: string[];
      results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }>;
    }> = [];

    let totalSuccess = 0;
    let totalFailed = 0;

    for (const doc of documents) {
      const title = doc.title || "无标题";
      let body = doc.body || "";
      const format = doc.format || "markdown";
      const paths = (doc.paths || []).slice(0, 5);

      if (paths.length === 0) {
        details.push({ title, paths: [], results: [{ path: "", error: "paths 为空" }] });
        totalFailed++;
        continue;
      }

      // 追尾源链接
      if (doc.source_url) {
        body = appendSourceLink(body, doc.source_url, doc.source_title || "原文档", format);
      }

      const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

      for (const path of paths) {
        try {
          const dirUuid = await ensureDirectoryPath(targetBookId, path);
          if (!dirUuid) {
            results.push({ path, error: "目录创建失败" });
            totalFailed++;
            continue;
          }

          const payload: Record<string, unknown> = { title, body, format };
          const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc to ${path}`);
          if (isErrorResult(data)) {
            const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
            results.push({ path, error: errMsg });
            totalFailed++;
            continue;
          }

          const newDoc = (data as { data?: { id: number; slug: string } }).data;
          if (!newDoc?.id) {
            results.push({ path, error: "文档创建返回无 ID" });
            totalFailed++;
            continue;
          }

          await apiPut(`/repos/${targetBookId}/toc`, {
            action: "appendNode",
            action_mode: "child",
            type: "DOC",
            doc_ids: [newDoc.id],
            target_uuid: dirUuid,
          }, `Append doc to TOC: ${path}`);

          results.push({ path, doc_id: newDoc.id, slug: newDoc.slug });
          totalSuccess++;
        } catch (err) {
          results.push({ path, error: err instanceof Error ? err.message : String(err) });
          totalFailed++;
        }
      }

      details.push({ title, paths, results });
    }

    const summary = {
      target_book_id: targetBookId,
      total_docs: documents.length,
      total_copies: totalSuccess,
      total_failed: totalFailed,
      details,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};