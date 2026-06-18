/**
 * rss/schedule — 定时抓取策略分析
 *
 * 主方案：读取 RSS 配置知识库（config.json 中 rss.namespaces.{source}.schedule_slugs），
 * 分析每个 feed 的最近更新频率，生成推荐下次抓取时间，写回知识库。
 *
 * schedule_slugs 格式：`["{book_id}/{doc_id}", ...]`，每个 feed 一篇文档。
 * 文档 slug 格式：`{source}--{feed}`，通过 slug 匹配找到对应 doc_id。
 *
 * 频率分档（保守策略，最小间隔 1 天）：
 *   - 高频：近 7 天 ≥5 篇 → 每天 1 次
 *   - 中频：近 7 天 1-4 篇 → 每 7 天
 *   - 低频：近 14 天 1 篇 → 每 15 天
 *   - 休眠：近 30 天 0 篇 → 每 30 天
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig, parseSlug, buildSlugStr } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { RSS_SOURCES } from "./sources.js";
import { loadKvMap } from "../kv/common.js";
import { setScheduleSlugs } from "../kv/common.js";

// ── 频率分档 ──

interface BandRule {
  label: string;
  range: string;
  intervalDays: number;
}

const BANDS: BandRule[] = [
  { label: "高频", range: "近7天≥5篇", intervalDays: 1 },
  { label: "中频", range: "近7天1-4篇", intervalDays: 7 },
  { label: "低频", range: "近14天1篇", intervalDays: 15 },
  { label: "休眠", range: "近30天0篇", intervalDays: 30 },
];

function classifyBand(recent7d: number, recent14d: number): BandRule {
  if (recent7d >= 5) return BANDS[0];
  if (recent7d >= 1 && recent7d <= 4) return BANDS[1];
  if (recent14d >= 1 && recent7d === 0) return BANDS[2];
  return BANDS[3];
}

// ── 文章时间戳解析 ──

interface ArticleMeta {
  author: string;
  date: Date;
  link: string;
  feed: string;
}

function parseArticles(kvMap: Record<string, string>): ArticleMeta[] {
  const articles: ArticleMeta[] = [];
  for (const [, value] of Object.entries(kvMap)) {
    try {
      const meta = JSON.parse(value);
      if (meta.date) {
        articles.push({
          author: meta.author || "未知",
          date: new Date(meta.date),
          link: meta.link || "",
          feed: meta.feed || "",
        });
      }
    } catch { /* 旧格式 */ }
  }
  return articles.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function countRecent(articles: ArticleMeta[], days: number, now: Date): { count: number; authors: string[] } {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recent = articles.filter((a) => a.date >= cutoff);
  return { count: recent.length, authors: [...new Set(recent.map((a) => a.author))] };
}

// ── schedule_slugs 操作 ──

function getScheduleSlugs(source: string): string[] {
  const cfg = loadConfig();
  return cfg.rss?.namespaces?.[source]?.schedule_slugs ?? [];
}

/** 通过 slug 在 schedule_slugs 中查找匹配的文档 */
async function findScheduleDoc(
  source: string,
  feedSlug: string,
): Promise<{ slug: string | null; lastFetch: string | null }> {
  const slugs = getScheduleSlugs(source);
  for (const s of slugs) {
    const parsed = parseSlug(s);
    if (!parsed) continue;
    const data = await apiGet(
      `/repos/${parsed.bookId}/docs/${parsed.docId}?raw=1`,
      undefined,
      `Read schedule: ${parsed.docId}`,
    );
    if (isErrorResult(data)) continue;
    const doc = (data as { data?: { slug?: string; body?: string } })?.data;
    if (!doc) continue;
    if (doc.slug === feedSlug) {
      const body = doc.body || "";
      const m = body.match(/上次抓取:\s*(.+)/);
      return { slug: s, lastFetch: m ? m[1].trim().slice(0, 10) : null };
    }
  }
  return { slug: null, lastFetch: null };
}

function buildScheduleBody(
  sourceName: string,
  label: string,
  source: string,
  feed: string,
  lastFetch: string | null,
  nextFetch: string,
  band: BandRule,
  recent7d: number,
  recent14d: number,
  recent30d: number,
  authors: string[],
): string {
  const lines: string[] = [];
  lines.push(`# ${sourceName}/${label}`);
  lines.push("");
  lines.push(`- 数据源: ${source}`);
  lines.push(`- Feed: ${feed}`);
  lines.push(`- 上次抓取: ${lastFetch || "无记录"}`);
  lines.push(`- 推荐下次抓取: ${nextFetch}`);
  lines.push(`- 抓取间隔: ${band.intervalDays}天`);
  lines.push(`- 频率分档: ${band.label}`);
  lines.push(`- 近7天文章数: ${recent7d}`);
  lines.push(`- 近14天文章数: ${recent14d}`);
  lines.push(`- 近30天文章数: ${recent30d}`);
  if (authors.length > 0) {
    lines.push(`- 活跃作者: ${authors.slice(0, 10).join(", ")}${authors.length > 10 ? "..." : ""}`);
  }
  return lines.join("\n");
}

async function upsertScheduleDoc(
  source: string,
  feedSlug: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const { slug: existingSlug } = await findScheduleDoc(source, feedSlug);

  if (existingSlug) {
    const parsed = parseSlug(existingSlug);
    if (!parsed) return { ok: false, error: `无效 slug: ${existingSlug}` };
    const result = await apiPut(
      `/repos/${parsed.bookId}/docs/${parsed.docId}`,
      { title, body, slug: feedSlug, format: "markdown", public: 0 },
      `Update schedule: ${feedSlug}`,
    );
    if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
    return { ok: true, slug: existingSlug };
  }

  // 新建：需要知道 schedule 知识库的 book_id，从已有 schedule_slugs 推断
  const slugs = getScheduleSlugs(source);
  let bookId: number | null = null;
  if (slugs.length > 0) {
    const parsed = parseSlug(slugs[0]);
    bookId = parsed?.bookId ?? null;
  }
  if (!bookId) {
    return { ok: false, error: "无法确定 schedule 知识库 book_id，请先在 config.json 中手动创建一篇 schedule 文档并添加到 schedule_slugs" };
  }

  const result = await apiPost(
    `/repos/${bookId}/docs`,
    { title, body, slug: feedSlug, format: "markdown", public: 0 },
    `Create schedule: ${feedSlug}`,
  );
  if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
  const docId = (result as { data?: { id: number } })?.data?.id;
  if (!docId) return { ok: false, error: "创建文档后未获取到 doc_id" };

  const newSlug = buildSlugStr(bookId, docId);
  const newSlugs = [...slugs, newSlug];
  setScheduleSlugs("rss", source, newSlugs);
  return { ok: true, slug: newSlug };
}

// ── 工具定义 ──

export const rssSchedule: McpTool = {
  name: "yuque_rss_schedule",
  description: "Analyze RSS feed recent update frequency and recommend next fetch time. 主方案：读取 schedule_slugs 配置知识库，分析最近更新频率，生成推荐抓取时间并写回。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Use yuque_rss_list_sources to list available sources." },
      kv_namespace: { type: "string", description: "KV namespace for dedup data. Defaults to source key." },
      mode: { type: "string", description: "Mode: 'analyze' (analyze + write back, default) | 'dry_run' (analyze only, no write)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false)" },
    },
    required: ["source"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.source, "source"));
    if (__v) return __v;

    const source = args?.source as string;
    const kvNamespace = (args?.kv_namespace as string) || source;
    const mode = (args?.mode as string) ?? "analyze";
    const cfg = loadConfig();
    const enableKv = !!(cfg.kv?.enabled);

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

    if (!enableKv) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_DISABLED",
          message: "KV 功能未启用",
          hint: "在 config.json 中设置 kv.enabled: true",
        }, null, 2) }],
        isError: true,
      };
    }

    const kvMap = await loadKvMap("rss", kvNamespace);
    const totalEntries = Object.keys(kvMap).length;

    if (totalEntries === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_DATA",
          message: `KV namespace '${kvNamespace}' 中没有数据`,
          hint: "先用 yuque_rss_fetch 抓取一些文章后再调用此工具",
        }, null, 2) }],
        isError: true,
      };
    }

    const articles = parseArticles(kvMap);

    if (articles.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source: src.name,
          kv_namespace: kvNamespace,
          total_articles: totalEntries,
          warning: "KV 中数据为旧格式（无时间戳），无法分析频率。建议重新抓取。",
          fallback_recommendation: { strategy: "保守策略", interval: "每 7 天", reason: "无历史频率数据" },
        }, null, 2) }],
      };
    }

    const now = new Date();
    const hasScheduleSlugs = getScheduleSlugs(source).length > 0;
    const analysisMode = hasScheduleSlugs ? "schedule_book" : "kv_fallback";

    const analyses: Array<{
      feed: string; label: string; lastFetch: string | null; nextFetch: string;
      intervalDays: number; band: string; recent7dCount: number; recent14dCount: number;
      recent30dCount: number; activeAuthors: string[];
    }> = [];

    for (const [feedKey, feed] of Object.entries(src.feeds)) {
      const feedArticles = articles.filter((a) => a.feed === feedKey);
      const { count: recent7d, authors: authors7d } = countRecent(feedArticles, 7, now);
      const { count: recent14d } = countRecent(feedArticles, 14, now);
      const { count: recent30d } = countRecent(feedArticles, 30, now);
      const band = classifyBand(recent7d, recent14d);

      let lastFetch: string | null = null;
      if (hasScheduleSlugs) {
        const feedSlug = `${source}--${feedKey}`;
        const found = await findScheduleDoc(source, feedSlug);
        lastFetch = found.lastFetch;
      }

      const nextFetchDate = new Date(now.getTime() + band.intervalDays * 24 * 60 * 60 * 1000);

      analyses.push({
        feed: feedKey,
        label: feed.label,
        lastFetch,
        nextFetch: nextFetchDate.toISOString().slice(0, 10),
        intervalDays: band.intervalDays,
        band: band.label,
        recent7dCount: recent7d,
        recent14dCount: recent14d,
        recent30dCount: recent30d,
        activeAuthors: authors7d,
      });
    }

    // 写回
    const writeResults: Array<{ feed: string; status: string; slug?: string; error?: string }> = [];
    if (analysisMode === "schedule_book" && mode !== "dry_run") {
      for (const analysis of analyses) {
        const feedSlug = `${source}--${analysis.feed}`;
        const title = `${src.name}/${analysis.label}`;
        const body = buildScheduleBody(
          src.name, analysis.label, source, analysis.feed,
          analysis.lastFetch, analysis.nextFetch,
          BANDS.find((b) => b.label === analysis.band) || BANDS[3],
          analysis.recent7dCount, analysis.recent14dCount, analysis.recent30dCount,
          analysis.activeAuthors,
        );
        const result = await upsertScheduleDoc(source, feedSlug, title, body);
        writeResults.push({
          feed: analysis.feed,
          status: result.ok ? "updated" : "failed",
          slug: result.slug,
          error: result.error,
        });
      }
    }

    const summary = {
      high: analyses.filter((a) => a.band === "高频").length,
      mid: analyses.filter((a) => a.band === "中频").length,
      low: analyses.filter((a) => a.band === "低频").length,
      dormant: analyses.filter((a) => a.band === "休眠").length,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          source,
          sourceName: src.name,
          mode: analysisMode,
          analyses,
          summary,
          writeResults: writeResults.length > 0 ? writeResults : undefined,
        }, null, 2),
      }],
    };
  },
};