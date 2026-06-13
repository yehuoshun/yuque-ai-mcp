/**
 * doc/copy-repo — 批量跨知识库文档复制
 *
 * 流程：list 源库文档 → 串行逐篇 copy_doc 逻辑 → 返回批量结果
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { sanitizeContent, classifyDoc, ensureDirectoryPath } from "./copy-common.js";

export const docCopyRepo: McpTool = {
  name: "yuque_copy_repo",
  description:
    "Batch copy documents from one repository to another. Auto-classifies each document into directory paths via LLM. Supports filtering by doc_ids (pass all if omitted).",

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
      raw: {
        type: "boolean",
        description: "Return raw full JSON (default false)",
      },
    },
    required: ["source_book_id", "target_book_id"],
  },

  async handler(args) {
    const __v = requiredString(args?.source_book_id, "source_book_id");
    if (__v) return __v;
    const __v2 = requiredString(args?.target_book_id, "target_book_id");
    if (__v2) return __v2;

    const sourceBookId = args?.source_book_id as string;
    const targetBookId = args?.target_book_id as string;
    const docIdsStr = (args?.doc_ids as string) || "";
    const raw = args?.raw as boolean | undefined;

    // ── 1. 获取源库文档列表 ──
    let docIds: string[] = [];

    if (docIdsStr) {
      docIds = docIdsStr.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      // 拉全量文档列表
      const allDocIds: string[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const listData = await apiGet(
          `/repos/${sourceBookId}/docs`,
          { offset: String(offset), limit: String(limit) },
          "List source docs",
        );
        if (isErrorResult(listData)) return listData;

        const items = (listData as { data?: Array<{ id: number }> }).data || [];
        if (items.length === 0) break;

        for (const item of items) {
          allDocIds.push(String(item.id));
        }

        if (items.length < limit) break;
        offset += limit;
      }

      docIds = allDocIds;
    }

    if (docIds.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NO_DOCS", message: "源库没有文档" }, null, 2) }],
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
      // 拉源文档
      const srcData = await apiGet(`/repos/docs/${docId}`, {}, `Get doc ${docId}`);
      if (isErrorResult(srcData)) {
        details.push({
          source_doc_id: docId,
          title: "获取失败",
          paths: [],
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
          paths: [],
          results: [{ path: "", error: "源文档不存在" }],
        });
        totalFailed++;
        continue;
      }

      const title = (src.title as string) || "无标题";
      const body = (src.body as string) || (src.body_html as string) || "";
      const format = (src.format as string) || "lake";
      const tags = (src.tags as Array<{ title: string }>)?.map((t) => t.title) || [];

      // 清洗
      const cleanedBody = sanitizeContent(body);

      // LLM 分类
      const paths = await classifyDoc(title, body, tags);

      // 逐路径创建
      const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

      for (const path of paths) {
        const parentId = await ensureDirectoryPath(targetBookId, path);
        if (parentId === null) {
          results.push({ path, error: "目录创建失败" });
          totalFailed++;
          continue;
        }

        const payload: Record<string, unknown> = {
          title,
          body: cleanedBody,
          format,
        };

        if (parentId) {
          payload.description = `[分类路径: ${path}]`;
        }

        const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc ${docId} to ${path}`);
        if (isErrorResult(data)) {
          const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
          results.push({ path, error: errMsg });
          totalFailed++;
          continue;
        }

        const newDoc = (data as { data?: { id: number; slug: string } }).data;
        results.push({ path, doc_id: newDoc?.id, slug: newDoc?.slug });
        totalSuccess++;
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