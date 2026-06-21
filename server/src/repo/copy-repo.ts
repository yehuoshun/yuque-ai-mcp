/**
 * repo/copy-repo — 批量跨知识库文档复制
 *
 * Agent 清洗内容后传入 documents 数组，工具串行建目录+创建文档
 */

import type { McpTool } from "../common/types.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath } from "../common/toc-ops.js";
import { appendSourceLink } from "../common/copy-common.js";

/** 并发复制数：平衡速度与语雀 API 限流 */
const COPY_CONCURRENCY = 5;

interface CopyDocument {
  title: string;
  body: string;
  format: string;
  paths: string[];
  source_url?: string;
  source_title?: string;
}

export const repoCopy: McpTool = {
  name: "yuque_copy_repo",
  description: "Batch copy documents to another repo. Agent provides cleaned documents array (title/body/format/paths). Tool creates TOC dirs and copies. 详见 references/api/extended_api.md",

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

    // 预处理：追尾源链接
    const preparedDocs = documents.map((doc) => {
      let body = doc.body || "";
      if (doc.source_url) {
        body = appendSourceLink(body, doc.source_url, doc.source_title || "原文档");
      }
      return {
        title: doc.title || "无标题",
        body,
        format: doc.format || "markdown",
        paths: (doc.paths || []).slice(0, 5),
      };
    });

    let totalSuccess = 0;
    let totalFailed = 0;
    const details: Array<{
      title: string;
      paths: string[];
      results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }>;
    }> = [];

    // 分批并发复制
    for (let i = 0; i < preparedDocs.length; i += COPY_CONCURRENCY) {
      const batch = preparedDocs.slice(i, i + COPY_CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (doc) => {
          const { title, body, format, paths } = doc;

          if (paths.length === 0) {
            return { title, paths: [] as string[], results: [{ path: "", error: "paths 为空" }] };
          }

          // 同一文档的多个 paths 也并发
          const pathResults = await Promise.all(
            paths.map(async (path): Promise<{ path: string; doc_id?: number; slug?: string; error?: string }> => {
              try {
                const dirResult = await ensureDirectoryPath(targetBookId, path);
                if (!dirResult.uuid) {
                  return { path, error: dirResult.error || "目录创建失败" };
                }
                const dirUuid = dirResult.uuid;

                const payload: Record<string, unknown> = { title, body, format };
                const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc to ${path}`);
                if (isErrorResult(data)) {
                  const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
                  return { path, error: errMsg };
                }

                const newDoc = (data as { data?: { id: number; slug: string } }).data;
                if (!newDoc?.id) {
                  return { path, error: "文档创建返回无 ID" };
                }

                await apiPut(`/repos/${targetBookId}/toc`, {
                  action: "appendNode",
                  action_mode: "child",
                  type: "DOC",
                  doc_ids: [newDoc.id],
                  target_uuid: dirUuid,
                }, `Append doc to TOC: ${path}`);

                return { path, doc_id: newDoc.id, slug: newDoc.slug };
              } catch (err) {
                return { path, error: err instanceof Error ? err.message : String(err) };
              }
            }),
          );

          return { title, paths, results: pathResults };
        }),
      );

      for (const r of batchResults) {
        for (const pr of r.results) {
          if (pr.error) totalFailed++;
          else totalSuccess++;
        }
        details.push(r);
      }

      batchResults.length = 0; // 释放引用
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