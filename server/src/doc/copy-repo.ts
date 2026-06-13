/**
 * doc/copy-repo — 批量跨知识库文档复制
 *
 * 流程：list 源库文档 → 按 Agent 指定的分类串行创建副本
 * 分类由 Agent 判断，classifications 由 Agent 传入
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { sanitizeContent, ensureDirectoryPath } from "./copy-common.js";

interface Classification {
  doc_id: string;
  paths: string[];
  title?: string;
}

export const docCopyRepo: McpTool = {
  name: "yuque_copy_repo",
  description:
    "Batch copy documents from one repository to another. The caller (Agent) provides classification paths for each document. Supports filtering by doc_ids.",

  inputSchema: {
    type: "object",
    properties: {
      source_book_id: {
        type: "string",
        description: "Source repository ID or namespace (required)",
      },
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      doc_ids: {
        type: "string",
        description: "Comma-separated document IDs to copy. Omit to copy all documents in the source repo.",
      },
      classifications: {
        type: "string",
        description: 'JSON array of {doc_id, paths, title?}. paths is array of directory paths (1-5). e.g. \'[{"doc_id":"123","paths":["Java/Spring","Database/MySQL"]}]\' (required)',
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON (default false)",
      },
    },
    required: ["source_book_id", "target_book_id", "classifications"],
  },

  async handler(args) {
    const __v = requiredString(args?.source_book_id, "source_book_id");
    if (__v) return __v;
    const __v2 = requiredString(args?.target_book_id, "target_book_id");
    if (__v2) return __v2;
    const __v3 = requiredString(args?.classifications, "classifications");
    if (__v3) return __v3;

    const sourceBookId = args?.source_book_id as string;
    const targetBookId = args?.target_book_id as string;
    const docIdsStr = (args?.doc_ids as string) || "";
    const raw = args?.raw as boolean | undefined;

    // 解析 classifications
    let classifications: Classification[];
    try {
      classifications = JSON.parse(args?.classifications as string) as Classification[];
      if (!Array.isArray(classifications) || classifications.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_CLASSIFICATIONS", message: "classifications 必须是非空 JSON 数组" }, null, 2) }],
          isError: true,
        };
      }
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "INVALID_CLASSIFICATIONS", message: "classifications 必须是有效的 JSON 数组" }, null, 2) }],
        isError: true,
      };
    }

    // 构建分类映射
    const classMap = new Map<string, Classification>();
    for (const c of classifications) {
      classMap.set(c.doc_id, c);
    }

    // ── 1. 获取源库文档列表 ──
    let docIds: string[] = [];

    if (docIdsStr) {
      docIds = docIdsStr.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      // 从 classifications 中提取 doc_ids
      docIds = classifications.map((c) => c.doc_id);
    }

    if (docIds.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NO_DOCS", message: "没有要复制的文档" }, null, 2) }],
        isError: true,
      };
    }

    // ── 2. 串行逐篇处理 ──
    const details: Array<{
      source_doc_id: string;
      title: string;
      paths: string[];
      results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }>;
    }> = [];

    let totalSuccess = 0;
    let totalFailed = 0;

    for (const docId of docIds) {
      const classification = classMap.get(docId);
      if (!classification) {
        details.push({
          source_doc_id: docId,
          title: "无分类",
          paths: [],
          results: [{ path: "", error: "classifications 中未找到该文档" }],
        });
        totalFailed++;
        continue;
      }

      const paths = classification.paths.slice(0, 5);

      // 拉源文档
      const srcData = await apiGet(`/repos/docs/${docId}`, {}, `Get doc ${docId}`);
      if (isErrorResult(srcData)) {
        details.push({
          source_doc_id: docId,
          title: "获取失败",
          paths,
          results: [{ path: "", error: "获取源文档失败" }],
        });
        totalFailed++;
        continue;
      }

      const src = (srcData as { data?: Record<string, unknown> }).data;
      if (!src) {
        details.push({
          source_doc_id: docId,
          title: "不存在",
          paths,
          results: [{ path: "", error: "源文档不存在" }],
        });
        totalFailed++;
        continue;
      }

      const title = classification.title || (src.title as string) || "无标题";
      const body = (src.body as string) || (src.body_html as string) || "";
      const format = (src.format as string) || "lake";

      // 清洗
      const cleanedBody = sanitizeContent(body);

      // 逐路径创建
      const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

      for (const path of paths) {
        try {
          const dirUuid = await ensureDirectoryPath(targetBookId, path);
          if (!dirUuid) {
            results.push({ path, error: "目录创建失败" });
            totalFailed++;
            continue;
          }

          const payload: Record<string, unknown> = {
            title,
            body: cleanedBody,
            format,
          };

          const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc ${docId} to ${path}`);
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

          // 挂到目录节点下
          const tocPayload: Record<string, unknown> = {
            action: "appendNode",
            action_mode: "child",
            type: "DOC",
            doc_ids: [newDoc.id],
            target_uuid: dirUuid,
          };
          await apiPut(`/repos/${targetBookId}/toc`, tocPayload, `Append doc to TOC: ${path}`);

          results.push({ path, doc_id: newDoc.id, slug: newDoc.slug });
          totalSuccess++;
        } catch (err) {
          results.push({ path, error: err instanceof Error ? err.message : String(err) });
          totalFailed++;
        }
      }

      details.push({ source_doc_id: docId, title, paths, results });
    }

    const summary = {
      source_book_id: sourceBookId,
      target_book_id: targetBookId,
      total_docs: docIds.length,
      total_copies: totalSuccess,
      total_failed: totalFailed,
      details,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  },
};