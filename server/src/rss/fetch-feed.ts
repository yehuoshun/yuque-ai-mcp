/**
 * rss/fetch-feed — 通用 RSS 抓取 → 解析 → 去重（语雀 KV）→ 写入语雀
 *
 * 职责：抓取 RSS/Atom Feed，解析条目，语雀 KV 去重后写入目标知识库。
 * 去重：调用 kv/common.ts 的 loadKvMap / saveKvMap，不再自己创建 KV 标记文档。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult, apiPost, apiPut } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { RSS_SOURCES } from "./sources.js";
import { parseFeed, type FeedEntry } from "./parser.js";
import { buildSlug } from "./dedup.js";
import { resolveKvRepo, loadKvMap, saveKvMap } from "../kv/common.js";

/** 构建 feed URL */
function buildFeedUrl(source: string, feedType: string, params?: Record<string, unknown>): string | null {
  const src = RSS_SOURCES[source];
  if (!src) return null;
  const feed = src.feeds[feedType];
  if (!feed) return null;

  if (feed.url) return feed.url;

  if (feed.url_template) {
    let url = feed.url_template;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`{${key}}`, String(value));
      }
    }
    return url;
  }

  return null;
}

/** 从 RepoRef 提取知识库标识 */
function repoRefToString(ref: { id?: number; book_id?: string; namespace?: string } | undefined): string {
  if (!ref) return "";
  if (ref.id) return String(ref.id);
  if (ref.book_id) return ref.book_id;
  if (ref.namespace) return ref.namespace;
  return "";
}

/**
 * 解析 RSS 目标知识库
 * 优先级：tool 参数 → config.rss.{source} → config.rss.default_repo
 */
function resolveRssRepo(source: string, paramRepo?: string): string {
  if (paramRepo) return paramRepo;
  const cfg = loadConfig();
  if (!cfg.rss) return "";
  return repoRefToString(cfg.rss?.sources?.[source]) || repoRefToString(cfg.rss?.default_repo);
}

/** 将 FeedEntry 转为语雀文档 Markdown body */
function entryToMarkdown(entry: FeedEntry, sourceName: string): string {
  const lines: string[] = [];

  lines.push(`> 来源：${sourceName} | 作者：${entry.author || "未知"} | ${entry.published || "未知时间"}`);
  lines.push("");
  lines.push(`# ${entry.title}`);
  lines.push("");

  if (entry.summary) {
    lines.push(entry.summary);
    lines.push("");
  }

  lines.push(`[原文链接](${entry.link})`);

  return lines.join("\n");
}

/** 创建一篇语雀文档 */
async function createDoc(
  bookId: string,
  title: string,
  body: string,
  link: string,
  slug: string,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const payload: Record<string, unknown> = {
    title,
    body,
    slug,
    description: `原文链接: ${link}`,
    format: "markdown",
    public: 0,
  };

  const data = await apiPost(`/repos/${bookId}/docs`, payload, `Create doc: ${title}`);
  if (isErrorResult(data)) {
    return { ok: false, error: JSON.stringify(data) };
  }

  const docId = (data as { data?: { id: number } })?.data?.id;

  // 加入目录
  if (docId) {
    try {
      await apiPut(`/repos/${bookId}/toc`, {
        action: "appendNode",
        action_mode: "sibling",
        type: "DOC",
        doc_ids: [docId],
      }, `Add to TOC: ${title}`);
    } catch { /* TOC 失败不影响主流程 */ }
  }

  return { ok: true, id: docId };
}

export const rssFetch: McpTool = {
  name: "yuque_rss_fetch",
  description: "Fetch RSS/Atom feed, parse entries, deduplicate via Yuque KV (single-doc JSON map), and save to Yuque repo. Call yuque_rss_list_sources first. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Use yuque_rss_list_sources to list available sources." },
      feed_type: { type: "string", description: "Feed type key, e.g. 'sitehome', 'picked', 'user'. Use yuque_rss_list_sources to see available feed types." },
      feed_params: { type: "string", description: "Template params for feeds with url_template. JSON string, e.g. '{\"username\":\"hsewr333\"}'" },
      target_repo: { type: "string", description: "RSS target repo ID or namespace. Optional — falls back to config.json rss config." },
      kv_repo: { type: "string", description: "KV dedup repo ID or namespace. Optional — falls back to config.json kv.default_repo." },
      kv_namespace: { type: "string", description: "KV namespace for dedup, e.g. 'cnblogs'. Defaults to source key." },
      max_items: { type: "number", description: "Max items to fetch and save (default 10, max 50)" },
      mode: { type: "string", description: "Mode: 'append' (save new docs, default) | 'dry_run' (preview only, no save)" },
      title_prefix: { type: "string", description: "Optional prefix for doc titles, e.g. '[博客园] '" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["source", "feed_type"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.source, "source"),
      requiredString(args?.feed_type, "feed_type"),
    );
    if (__v) return __v;

    const source = args?.source as string;
    const feedType = args?.feed_type as string;
    let feedParams = args?.feed_params as Record<string, unknown> | string | undefined;
    if (typeof feedParams === "string") {
      try { feedParams = JSON.parse(feedParams); } catch { /* keep as-is */ }
    }
    feedParams = feedParams as Record<string, unknown> | undefined;
    const targetRepoParam = args?.target_repo as string | undefined;
    const kvRepoParam = args?.kv_repo as string | undefined;
    const kvNamespace = (args?.kv_namespace as string) || source;
    const maxItems = Math.min((args?.max_items as number) ?? 10, 50);
    const mode = (args?.mode as string) ?? "append";
    const titlePrefix = (args?.title_prefix as string) ?? "";

    const targetRepo = resolveRssRepo(source, targetRepoParam);
    const cfg = loadConfig();
    const enableKv = !!(cfg.kv?.enabled);
    const kvRepo = enableKv ? (kvRepoParam || resolveKvRepo()) : "";

    // 1. 查数据源配置
    const src = RSS_SOURCES[source];
    if (!src) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "UNKNOWN_SOURCE",
          message: `未知数据源: ${source}`,
          hint: "调用 yuque_rss_list_sources 查看可用数据源",
        }, null, 2) }],
        isError: true,
      };
    }

    const feed = src.feeds[feedType];
    if (!feed) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "UNKNOWN_FEED_TYPE",
          message: `未知 feed 类型: ${feedType}`,
          available: Object.keys(src.feeds),
        }, null, 2) }],
        isError: true,
      };
    }

    // 2. 构建 feed URL
    const feedUrl = buildFeedUrl(source, feedType, feedParams);
    if (!feedUrl) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "URL_BUILD_FAILED",
          message: "无法构建 feed URL，请检查 feed_params",
        }, null, 2) }],
        isError: true,
      };
    }

    // 3. 抓取 RSS
    let xml: string;
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_FAILED",
            message: `RSS 抓取失败，HTTP ${res.status}`,
            url: feedUrl,
          }, null, 2) }],
          isError: true,
        };
      }
      xml = await res.text();
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NETWORK_ERROR",
          message: `网络请求失败: ${err instanceof Error ? err.message : String(err)}`,
          url: feedUrl,
        }, null, 2) }],
        isError: true,
      };
    }

    // 4. 解析
    const parsed = parseFeed(xml);
    const entries = parsed.entries.slice(0, maxItems);

    // 5. 去重：加载 KV map，过滤已存在的 slug
    let newEntries: Array<FeedEntry & { slug: string }> = [];
    let skippedCount = 0;
    let existingMap: Record<string, string> = {};

    if (enableKv && kvRepo && mode !== "dry_run") {
      existingMap = await loadKvMap(kvRepo, kvNamespace);
      for (const entry of entries) {
        const slug = buildSlug(source, entry.link);
        if (slug in existingMap) {
          skippedCount++;
        } else {
          newEntries.push({ ...entry, slug });
        }
      }
    } else {
      newEntries = entries.map((e) => ({
        ...e,
        slug: buildSlug(source, e.link),
      }));
    }

    // 6. dry_run 模式：只预览不写入
    if (mode === "dry_run") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            mode: "dry_run",
            source: `${src.name} / ${feed.label}`,
            feed_url: feedUrl,
            feed_title: parsed.feedTitle,
            total: entries.length,
            entries: newEntries.map((e) => ({
              title: e.title,
              link: e.link,
              slug: e.slug,
              author: entries.find((x) => x.link === e.link)?.author,
              published: entries.find((x) => x.link === e.link)?.published,
            })),
          }, null, 2),
        }],
      };
    }

    // 7. 写入语雀
    const results: Array<{ title: string; link: string; slug: string; doc_id?: number; status: string; error?: string }> = [];
    for (const entry of newEntries) {
      const docTitle = `${titlePrefix}${entry.title}`;
      const body = entryToMarkdown(entry, src.name);

      const result = await createDoc(targetRepo, docTitle, body, entry.link, entry.slug);
      if (result.ok) {
        // 写入成功后更新 KV map
        existingMap[entry.slug] = entry.link;
      }
      results.push({
        title: entry.title,
        link: entry.link,
        slug: entry.slug,
        doc_id: result.id,
        status: result.ok ? "created" : "failed",
        error: result.error,
      });
    }

    // 8. 批量保存 KV map（所有新条目写完后一次更新）
    if (enableKv && kvRepo && newEntries.length > 0) {
      await saveKvMap(kvRepo, kvNamespace, existingMap);
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          source: `${src.name} / ${feed.label}`,
          feed_url: feedUrl,
          target_repo: targetRepo,
          kv_repo: kvRepo,
          kv_namespace: kvNamespace,
          fetched: entries.length,
          new: newEntries.length,
          skipped: skippedCount,
          dedup: { strategy: enableKv ? "yuque-kv-json-map" : "disabled", kv_repo: kvRepo || null },
          results,
        }, null, 2),
      }],
    };
  },
};