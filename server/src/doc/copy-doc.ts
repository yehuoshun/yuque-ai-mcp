/**
 * doc/copy-doc — 单文档跨知识库复制
 *
 * 流程：拉源文档 → 清洗 content → LLM 分类 → 目标库建目录 → 创建副本
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { sanitizeContent, classifyDoc, ensureDirectoryPath } from "./copy-common.js";

export const docCopySingle: McpTool = {
  name: "yuque_copy_doc",
  description:
    "Copy a single document to another repository. Auto-classifies the document into directory paths via LLM, cleans clipped web content, and creates copies under each classified path.",

  inputSchema: {
    type: "object",
    properties: {
      doc_id: {
        type: "string",
        description: "Source document ID (required)",
      },
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON (default false)",
      },
    },
    required: ["doc_id", "target_book_id"],
  },

  async handler(args) {
    const __v = requiredString(args?.doc_id, "doc_id");
    if (__v) return __v;
    const __v2 = requiredString(args?.target_book_id, "target_book_id");
    if (__v2) return __v2;

    const docId = args?.doc_id as string;
    const targetBookId = args?.target_book_id as string;
    const raw = args?.raw as boolean | undefined;

    // ── 1. 拉源文档 ──
    const srcData = await apiGet(`/repos/docs/${docId}`, {}, "Get source doc");
    if (isErrorResult(srcData)) return srcData;

    const src = (srcData as { data?: Record<string, unknown> }).data;
    if (!src) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "DOC_NOT_FOUND", message: "源文档不存在" }, null, 2) }],
        isError: true,
      };
    }

    const title = (src.title as string) || "无标题";
    const body = (src.body as string) || (src.body_html as string) || "";
    const format = (src.format as string) || "lake";
    const tags = (src.tags as Array<{ title: string }>)?.map((t) => t.title) || [];

    // ── 2. 清洗 content ──
    const cleanedBody = sanitizeContent(body);

    // ── 3. LLM 分类 ──
    const paths = await classifyDoc(title, body, tags);

    // ── 4. 逐路径创建副本 ──
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      const parentId = await ensureDirectoryPath(targetBookId, path);
      if (parentId === null) {
        results.push({ path, error: "目录创建失败" });
        continue;
      }

      const payload: Record<string, unknown> = {
        title,
        body: cleanedBody,
        format,
      };

      // 有父目录时通过 description 记录路径信息（语雀 API 不直接支持 parent_id 创建）
      if (parentId) {
        payload.description = `[分类路径: ${path}]`;
      }

      const data = await apiPost(`/repos/${targetBookId}/docs`, payload, `Copy doc to ${path}`);
      if (isErrorResult(data)) {
        const errMsg = (data as { content?: Array<{ text: string }> }).content?.[0]?.text || "Unknown error";
        results.push({ path, error: errMsg });
        continue;
      }

      const newDoc = (data as { data?: { id: number; slug: string } }).data;
      results.push({
        path,
        doc_id: newDoc?.id,
        slug: newDoc?.slug,
      });
    }

    const summary = {
      source_doc_id: docId,
      source_title: title,
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