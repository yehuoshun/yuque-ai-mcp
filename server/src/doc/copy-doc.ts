/**
 * doc/copy-doc — 单文档跨知识库复制
 *
 * 流程：拉源文档 → 清洗 content → 按 Agent 指定的路径建目录 → 创建副本
 * 分类由 Agent 判断，paths 由 Agent 传入
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { sanitizeContent, ensureDirectoryPath } from "./copy-common.js";

export const docCopySingle: McpTool = {
  name: "yuque_copy_doc",
  description:
    "Copy a single document to another repository. The caller (Agent) provides classification paths. The tool creates directory structure and copies the document under each path.",

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
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"Java/Spring/SpringBoot\",\"Database/MySQL\"]'. At least 1, max 5. (required)",
      },
      title: {
        type: "string",
        description: "Custom title for the copied document. Defaults to original title",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON (default false)",
      },
    },
    required: ["doc_id", "target_book_id", "paths"],
  },

  async handler(args) {
    const __v = requiredString(args?.doc_id, "doc_id");
    if (__v) return __v;
    const __v2 = requiredString(args?.target_book_id, "target_book_id");
    if (__v2) return __v2;
    const __v3 = requiredString(args?.paths, "paths");
    if (__v3) return __v3;

    const docId = args?.doc_id as string;
    const targetBookId = args?.target_book_id as string;
    const raw = args?.raw as boolean | undefined;
    const customTitle = args?.title as string | undefined;

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

    const title = customTitle || (src.title as string) || "无标题";
    const body = (src.body as string) || (src.body_html as string) || "";
    const bodyLake = src.body_lake as string | undefined;
    const format = (src.format as string) || "lake";
    const isLake = format === "lake" && !!bodyLake;

    // ── 2. 准备 content ──
    const finalBody = isLake ? bodyLake : sanitizeContent(body);
    const finalFormat = isLake ? "lake" : (format || "markdown");

    // ── 3. 逐路径创建副本 ──
    const results: Array<{ path: string; doc_id?: number; slug?: string; error?: string }> = [];

    for (const path of paths) {
      try {
        // 确保目录存在，拿到目录节点的 uuid
        const dirUuid = await ensureDirectoryPath(targetBookId, path);
        if (!dirUuid) {
          results.push({ path, error: "目录创建失败" });
          continue;
        }

        // 创建文档
        const payload: Record<string, unknown> = {
          title,
          body: finalBody,
          format: finalFormat,
        };

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

        // 把文档挂到目录节点下
        const tocPayload: Record<string, unknown> = {
          action: "appendNode",
          action_mode: "child",
          type: "DOC",
          doc_ids: [newDoc.id],
          target_uuid: dirUuid,
        };
        await apiPut(`/repos/${targetBookId}/toc`, tocPayload, `Append doc to TOC: ${path}`);

        results.push({
          path,
          doc_id: newDoc.id,
          slug: newDoc.slug,
        });
      } catch (err) {
        results.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
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