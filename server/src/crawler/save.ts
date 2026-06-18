/**
 * crawler/save — 去重 + 写入语雀
 *
 * 职责：接收 Agent 处理好的 HTML/标题 → 去重（KV JSON map）→ 创建语雀文档。
 * fetch 和 extract 由 yuque_crawl_fetch + yuque_crawl_extract 负责。
 *
 * 端点到语雀：POST /repos/{book_id}/docs（创建文档）
 * 去重：调用 kv/common.ts 的 loadKvMap / kvIncrementalSet
 */

import { createHash } from "crypto";
import type { McpTool } from "../common/types.js";
import { isErrorResult, apiPost, apiPut } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { loadKvMap, kvIncrementalSet } from "../kv/common.js";

/** 解析目标知识库 */
function resolveRepo(source?: string, paramRepo?: string): number | null {
  if (paramRepo) return parseInt(paramRepo, 10) || null;
  const cfg = loadConfig();
  return cfg.crawler?.namespaces?.[source || ""]?.book_id ?? null;
}

/** 生成去重 slug（URL → md5 前 12 位） */
function buildSlug(url: string): string {
  return createHash("md5").update(url).digest("hex").slice(0, 12);
}

export const crawlSave: McpTool = {
  name: "yuque_crawl_save",
  description: "Dedup + save HTML to Yuque repo. Use yuque_crawl_fetch + yuque_crawl_extract to prepare content first. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Source URL (for dedup slug + source footer)" },
      title: { type: "string", description: "Document title (required)" },
      body: { type: "string", description: "HTML body content to save (required)" },
      source: { type: "string", description: "Source key for repo routing and KV namespace, e.g. 'cnblogs'" },
      target_repo: { type: "string", description: "Target repo ID. Falls back to config crawler.namespaces.{source}.book_id." },
      kv_namespace: { type: "string", description: "KV namespace for dedup. Defaults to source if set, otherwise 'crawler'." },
      format: { type: "string", description: "Content format: html (default) | markdown | lake" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["url", "title", "body"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.url, "url"),
      requiredString(args?.title, "title"),
      requiredString(args?.body, "body"),
    );
    if (__v) return __v;

    const url = args?.url as string;
    const title = args?.title as string;
    const body = args?.body as string;
    const source = args?.source as string | undefined;
    const targetRepoParam = args?.target_repo as string | undefined;
    const kvNamespace = (args?.kv_namespace as string) || source || "crawler";
    const format = (args?.format as string) ?? "html";

    const cfg = loadConfig();
    const targetRepo = resolveRepo(source, targetRepoParam);
    const enableKv = !!(cfg.kv?.enabled);

    // 1. 去重
    const slug = buildSlug(url);
    let isDuplicate = false;

    if (enableKv) {
      try {
        const existingMap = await loadKvMap("crawler", kvNamespace);
        isDuplicate = slug in existingMap;
      } catch { /* 去重检查失败不影响主流程 */ }
    }

    if (isDuplicate) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "skipped",
            reason: "duplicate",
            url,
            title,
            slug,
          }, null, 2),
        }],
      };
    }

    // 2. 写入语雀
    if (!targetRepo) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_TARGET_REPO",
          message: "未配置目标知识库，请在 config.json 中设置 crawler.namespaces.{source}.book_id 或传 target_repo 参数",
        }, null, 2) }],
        isError: true,
      };
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const docBody = `> 来源：${url} | 抓取时间：${ts}\n\n${body}`;

    const createResult = await apiPost(`/repos/${targetRepo}/docs`, {
      title,
      body: docBody,
      slug,
      description: `原文链接: ${url}`,
      format,
      public: 0,
    }, `Create doc: ${title}`);

    if (isErrorResult(createResult)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          status: "failed",
          url,
          title,
          error: JSON.stringify(createResult),
        }, null, 2) }],
        isError: true,
      };
    }

    const docId = (createResult as { data?: { id: number } })?.data?.id;

    // 加入目录
    if (docId) {
      try {
        await apiPut(`/repos/${targetRepo}/toc`, {
          action: "appendNode",
          action_mode: "sibling",
          type: "DOC",
          doc_ids: [docId],
        }, `Add to TOC: ${title}`);
      } catch { /* TOC 失败不影响主流程 */ }
    }

    // 3. 增量写入 KV 标记
    if (enableKv) {
      try {
        const kvMeta = JSON.stringify({
          link: url,
          date: new Date().toISOString(),
        });
        await kvIncrementalSet("crawler", kvNamespace, slug, kvMeta);
      } catch { /* KV 标记失败不影响主流程 */ }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          status: "saved",
          url,
          title,
          slug,
          doc_id: docId,
          target_repo: targetRepo,
          kv_namespace: kvNamespace,
          body_size: body.length,
        }, null, 2),
      }],
    };
  },
};
