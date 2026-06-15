/**
 * doc/copy-doc — 单文档跨知识库复制
 *
 * 两种模式：
 * 1. Agent 传入 title/body/format/paths → 工具建目录+创建文档
 * 2. Agent 传入 doc_id + source_book_id → 工具拉取源文档，返回原始内容给 Agent
 *    Agent 清洗后再调模式1创建。解决大文档（>30KB）通过 mcporter CLI 传 body 不稳定的问题。
 */

import type { McpTool } from "../common/types.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { requiredString } from "../common/validate.js";
import { ensureDirectoryPath, appendSourceLink } from "../common/copy-common.js";

export const docCopySingle: McpTool = {
  name: "yuque_copy_doc",
  description:
    "Copy a single document to another repository. Two modes: (1) Agent provides cleaned content (title/body/format/paths) for creation; (2) Agent provides doc_id+source_book_id, tool fetches source doc and returns raw content for Agent to clean, then Agent calls mode 1. Mode 2 solves large doc (>30KB) instability through mcporter CLI.",

  inputSchema: {
    type: "object",
    properties: {
      target_book_id: {
        type: "string",
        description: "Target repository ID or namespace (required)",
      },
      // ─── 模式 1：Agent 传入内容 ───
      title: {
        type: "string",
        description: "Document title (required for mode 1: manual content)",
      },
      body: {
        type: "string",
        description: "Document body, cleaned by Agent (required for mode 1: manual content)",
      },
      format: {
        type: "string",
        description: "Content format: markdown / lake / html (required for mode 1)",
      },
      // ─── 模式 2：工具内部拉取 ───
      doc_id: {
        type: "number",
        description: "Source document ID. When provided, tool fetches the doc and returns raw content (title/body/format) for Agent to clean and create via mode 1. Requires source_book_id.",
      },
      source_book_id: {
        type: "string",
        description: "Source repository ID or namespace (optional, defaults to doc's own repo when doc_id is provided)",
      },
      // ─── 公共参数 ───
      paths: {
        type: "string",
        description: "JSON array of directory paths, e.g. '[\"Java/Spring\",\"Database/MySQL\"]'. 1-5 paths (required)",
      },
      source_url: {
        type: "string",
        description: "Source document URL, appended as footer link. In mode 2, auto-generated from doc slug if not provided.",
      },
      source_title: {
        type: "string",
        description: "Source document title for the footer link. In mode 2, uses source doc title if not provided.",
      },
      raw: {
        type: "boolean",
        description: "Return raw full JSON",
      },
    },
    required: ["target_book_id", "paths"],
  },

  async handler(args) {
    const targetBookId = args?.target_book_id as string;
    const docId = args?.doc_id as number | undefined;
    const sourceBookId = args?.source_book_id as string | undefined;
    let title = args?.title as string | undefined;
    let body = args?.body as string | undefined;
    let format = args?.format as string | undefined;
    let sourceUrl = args?.source_url as string | undefined;
    let sourceTitle = args?.source_title as string | undefined;
    const raw = args?.raw as boolean | undefined;

    // 校验必填
    const err = requiredString(targetBookId, "target_book_id");
    if (err) return err;

    // ─── 模式 2：工具内部拉取源文档 ───
    if (docId) {
      // source_book_id 必填（语雀 API 无全局文档查询端点）
      if (!sourceBookId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "MISSING_SOURCE_BOOK_ID",
            message: "doc_id 模式下 source_book_id 为必填参数（语雀 API 无全局文档查询端点，无法自动推断所属知识库）",
            doc_id: docId,
          }, null, 2) }],
          isError: true,
        };
      }

      // 拉取源文档完整内容（markdown 格式）
      const srcDoc = await apiGet(`/repos/${sourceBookId}/docs/${docId}`, {
        raw: "1",
      }, `Fetch source doc ${docId}`);

      if (isErrorResult(srcDoc)) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_DOC_FAILED",
            message: "拉取源文档内容失败",
            doc_id: docId,
            source_book_id: sourceBookId,
          }, null, 2) }],
          isError: true,
        };
      }

      const data = (srcDoc as { data?: { title: string; body: string; slug: string; book?: { namespace: string } } }).data;
      if (!data) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_DOC_FAILED",
            message: "源文档内容为空",
            doc_id: docId,
          }, null, 2) }],
          isError: true,
        };
      }

      title = data.title;
      body = data.body;
      format = "markdown"; // 语雀 API raw=1 返回 markdown

      if (!sourceTitle) sourceTitle = data.title;
      if (!sourceUrl) {
        sourceUrl = `https://www.yuque.com/${data.book?.namespace || sourceBookId}/${data.slug}`;
      }

      // 返回原始内容给 Agent，Agent 清洗后调手动模式创建
      // 清理控制字符（JSON.stringify 不处理 \x00-\x1f，会导致解析失败）
      const safeBody = body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          mode: "fetch-only",
          source_doc_id: docId,
          source_book_id: sourceBookId,
          title,
          body: safeBody,
          format,
          source_url: sourceUrl,
          source_title: sourceTitle,
          hint: "Agent 清洗内容后，调用 yuque_copy_doc 手动模式（title/body/format/paths）创建文档",
        }, null, 2) }],
      };
    }

    // 校验模式1必填
    if (!docId) {
      for (const [val, name] of [[title, "title"], [body, "body"], [format, "format"]] as const) {
        const err2 = requiredString(val as string, name);
        if (err2) return err2;
      }
    }

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

    // 确保 title/body 已填充（编译期保证，运行时兜底）
    if (!title || !body || !format) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "MISSING_CONTENT",
          message: docId ? "工具内部拉取失败，title/body 为空" : "manual 模式缺少 title/body/format 参数",
        }, null, 2) }],
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
      mode: docId ? "auto-fetch" : "manual",
      source_doc_id: docId || null,
      source_book_id: sourceBookId || null,
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