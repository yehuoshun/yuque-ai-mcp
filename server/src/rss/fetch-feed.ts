/**
 * rss/fetch-feed — 通用 RSS 抓取 → 解析 → 去重（语雀 KV）→ 写入语雀
 *
 * 端点到语雀：无（工具内部调用语雀 API 创建文档）
 * 职责：抓取 RSS/Atom Feed，解析条目，语雀 KV 去重后写入目标知识库
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult, apiPost } from "../common/api-client.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { RSS_SOURCES } from "./sources.js";
import { parseFeed, type FeedEntry } from "./parser.js";
import { buildSlug, checkDuplicates } from "./dedup.js";

/** 语雀知识库文档上限 */
const DOC_LIMIT = 5000;

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

/**
 * 解析知识库标识（rss 和 kv 共用）
 * 优先级：tool 参数 → config.{domain}.{source}.book_id → .namespace → config.{domain}.default_repo → 报错
 */
function resolveRepo(
  domain: "rss" | "kv",
  source: string,
  paramRepo?: string,
): string {
  if (paramRepo) return paramRepo;

  const cfg = loadConfig();
  const domainCfg = cfg[domain];
  if (!domainCfg) {
    throw new Error(
      `未配置 ${domain} 目标知识库。请在 config.json 中设置 ${domain}.default_repo 或 ${domain}.{source}.book_id/namespace`
    );
  }

  const sourceCfg = domainCfg[source];
  if (sourceCfg && typeof sourceCfg === "object") {
    if (sourceCfg.book_id) return sourceCfg.book_id;
    if (sourceCfg.namespace) return sourceCfg.namespace;
  }

  if (domainCfg.default_repo) {
    if (domainCfg.default_repo.book_id) return domainCfg.default_repo.book_id;
    if (domainCfg.default_repo.namespace) return domainCfg.default_repo.namespace;
  }

  throw new Error(
    `无法确定 ${domain} 目标知识库。数据源 "${source}" 未配置，default_repo 也未配置。`
  );
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

/** 创建一篇语雀文档（指定 slug 用于 KV 去重） */
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
  return { ok: true, id: docId };
}

export const rssFetch: McpTool = {
  name: "yuque_rss_fetch",
  description: "Fetch RSS/Atom feed, parse entries, deduplicate via Yuque KV (slug-based), and save to Yuque repo. Use yuque_rss_list_sources first to see available sources.",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Use yuque_rss_list_sources to list available sources." },
      feed_type: { type: "string", description: "Feed type key, e.g. 'sitehome', 'picked', 'user'. Use yuque_rss_list_sources to see available feed types." },
      feed_params: { type: "object", description: "Template params for feeds with url_template, e.g. { username: 'hsewr333' }" },
      target_repo: { type: "string", description: "RSS target repo ID or namespace. Optional — falls back to config.json rss config." },
      kv_repo: { type: "string", description: "KV dedup repo ID or namespace. Optional — falls back to config.json kv config." },
      max_items: { type: "number", description: "Max items to fetch and save (default 10, max 50)" },
      mode: { type: "string", description: "Mode: 'append' (save new docs, default) | 'dry_run' (preview only, no save)" },
      title_prefix: { type: "string", description: "Optional prefix for doc titles, e.g. '[博客园] '" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["source", "feed_type"],
  },

  async handler(args) {
    // @validate
    const __v = check(
      requiredString(args?.source, "source"),
      requiredString(args?.feed_type, "feed_type"),
    );
    if (__v) return __v;

    const source = args?.source as string;
    const feedType = args?.feed_type as string;
    const feedParams = args?.feed_params as Record<string, unknown> | undefined;
    const targetRepoParam = args?.target_repo as string | undefined;
    const kvRepoParam = args?.kv_repo as string | undefined;
    const maxItems = Math.min((args?.max_items as number) ?? 10, 50);
    const mode = (args?.mode as string) ?? "append";
    const titlePrefix = (args?.title_prefix as string) ?? "";

    // 解析目标知识库
    let targetRepo: string;
    let kvRepo: string;
    let enableKv = true;
    try {
      targetRepo = resolveRepo("rss", source, targetRepoParam);
      const cfg = loadConfig();
      const rssSourceCfg = cfg.rss?.[source];
      if (rssSourceCfg && typeof rssSourceCfg === "object" && rssSourceCfg.enable_kv === false) {
        enableKv = false;
      }
      if (enableKv) {
        kvRepo = resolveRepo("kv", source, kvRepoParam);
      } else {
        kvRepo = "";
      }
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "MISSING_REPO",
          message: err instanceof Error ? err.message : String(err),
        }, null, 2) }],
        isError: true,
      };
    }

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

    // 5. 去重（dry_run 或 enable_kv=false 跳过）
    let newEntries: Array<{ title: string; link: string; slug: string }> = [];
    let skippedCount = 0;

    if (mode === "dry_run" || !enableKv) {
      newEntries = entries.map((e) => ({
        title: e.title,
        link: e.link,
        slug: buildSlug(source, e.link),
      }));
    } else {
      const result = await checkDuplicates(kvRepo, source, entries);
      newEntries = result.newEntries;
      skippedCount = result.skippedCount;
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
      const body = entryToMarkdown(
        { title: entry.title, link: entry.link, summary: "", author: "", published: "", guid: entry.link },
        src.name,
      );

      const result = await createDoc(targetRepo, docTitle, body, entry.link, entry.slug);
      results.push({
        title: entry.title,
        link: entry.link,
        slug: entry.slug,
        doc_id: result.id,
        status: result.ok ? "created" : "failed",
        error: result.error,
      });
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          source: `${src.name} / ${feed.label}`,
          feed_url: feedUrl,
          target_repo: targetRepo,
          kv_repo: kvRepo,
          fetched: entries.length,
          new: newEntries.length,
          skipped: skippedCount,
          dedup: { strategy: enableKv ? "yuque-kv-slug" : "disabled", kv_repo: kvRepo || null },
          results,
        }, null, 2),
      }],
    };
  },
};