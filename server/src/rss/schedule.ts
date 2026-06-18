/**
 * rss/schedule — 定时抓取策略分析
 *
 * 主方案：读取 RSS 配置知识库（config.json 中 rss.schedule.book_id），
 * 分析每个 feed 的最近更新频率，生成推荐下次抓取时间，写回知识库。
 *
 * 兜底方案：KV 去重数据（无配置知识库时自动回退）。
 *
 * 频率分档（保守策略，最小间隔 1 天）：
 *   - 高频：近 7 天 ≥5 篇 → 每天 1 次
 *   - 中频：近 7 天 1-4 篇 → 每 7 天
 *   - 低频：近 14 天 1 篇 → 每 15 天
 *   - 休眠：近 30 天 0 篇 → 每 30 天
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "../common/api-client.js";
import { RSS_SOURCES } from "./sources.js";
import { loadKvMap } from "../kv/common.js";

// ── 类型定义 ──

interface FeedAnalysis {
  source: string;
  sourceName: string;
  feed: string;
  label: string;
  lastFetch: string | null;
  nextFetch: string;
  intervalDays: number;
  band: string;
  recent7dCount: number;
  recent14dCount: number;
  recent30dCount: number;
  activeAuthors: string[];
}

interface ScheduleResult {
  source: string;
  sourceName: string;
  mode: "schedule_book" | "kv_fallback" | "no_data";
  scheduleBookId?: number;
  analyses: FeedAnalysis[];
  summary: {
    high: number;
    mid: number;
    low: number;
    dormant: number;
  };
}

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

function classifyBand(recent7d: number, recent14d: number, recent30d: number): BandRule {
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
}

function parseArticles(kvMap: Record<string, string>): ArticleMeta[] {
  const articles: ArticleMeta[] = [];
  for (const [slug, value] of Object.entries(kvMap)) {
    try {
      const meta = JSON.parse(value);
      if (meta.date) {
        articles.push({
          author: meta.author || "未知",
          date: new Date(meta.date),
          link: meta.link || "",
        });
      }
    } catch {
      // 旧格式，跳过
    }
  }
  return articles.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** 统计最近 N 天内的文章数和活跃作者 */
function countRecent(
  articles: ArticleMeta[],
  days: number,
  now: Date,
): { count: number; authors: string[] } {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recent = articles.filter((a) => a.date >= cutoff);
  const authors = [...new Set(recent.map((a) => a.author))];
  return { count: recent.length, authors };
}

// ── 配置知识库操作 ──

/** 获取 RSS 配置知识库 ID */
function getScheduleBookId(): number | null {
  const cfg = loadConfig();
  if (!cfg.rss?.schedule?.book_id) return null;
  return cfg.rss.schedule.book_id;
}

/** 文档 slug 格式：{source}--{feed} */
function buildSlug(source: string, feed: string): string {
  return `${source}--${feed}`;
}

/** 从配置知识库中读取一个 feed 的已有记录 */
async function readScheduleDoc(
  bookId: number,
  slug: string,
): Promise<{ docId: number | null; lastFetch: string | null }> {
  // 搜 slug 找文档
  const searchData = await apiGet(
    `/repos/${bookId}/docs?q=${encodeURIComponent(slug)}`,
    undefined,
    `Search schedule: ${slug}`,
  );
  if (isErrorResult(searchData)) return { docId: null, lastFetch: null };

  const docs = (searchData as { data?: Array<{ id: number; slug: string; body?: string; content_updated_at?: string }> })?.data || [];
  const doc = docs.find((d) => d.slug === slug);

  if (!doc) return { docId: null, lastFetch: null };

  // 从 body 中提取上次抓取时间
  const body = doc.body || "";
  const m = body.match(/上次抓取:\s*(.+)/);
  const lastFetch = m ? m[1].trim().slice(0, 10) : null;

  return { docId: doc.id, lastFetch };
}

/** 构建 schedule 文档的 Markdown 内容 */
function buildScheduleBody(analysis: FeedAnalysis): string {
  const lines: string[] = [];
  lines.push(`# ${analysis.sourceName}/${analysis.label}`);
  lines.push("");
  lines.push(`- 数据源: ${analysis.source}`);
  lines.push(`- Feed: ${analysis.feed}`);
  lines.push(`- 上次抓取: ${analysis.lastFetch || "无记录"}`);
  lines.push(`- 推荐下次抓取: ${analysis.nextFetch}`);
  lines.push(`- 抓取间隔: ${analysis.intervalDays}天`);
  lines.push(`- 频率分档: ${analysis.band}`);
  lines.push(`- 近7天文章数: ${analysis.recent7dCount}`);
  lines.push(`- 近14天文章数: ${analysis.recent14dCount}`);
  lines.push(`- 近30天文章数: ${analysis.recent30dCount}`);
  if (analysis.activeAuthors.length > 0) {
    lines.push(`- 活跃作者: ${analysis.activeAuthors.slice(0, 10).join(", ")}${analysis.activeAuthors.length > 10 ? "..." : ""}`);
  }
  return lines.join("\n");
}

/** 写入或更新 schedule 文档 */
async function upsertScheduleDoc(
  bookId: number,
  slug: string,
  analysis: FeedAnalysis,
): Promise<{ ok: boolean; docId?: number; error?: string }> {
  const body = buildScheduleBody(analysis);
  const { docId } = await readScheduleDoc(bookId, slug);

  if (docId) {
    // 更新已有文档
    const result = await apiPut(
      `/repos/${bookId}/docs/${docId}`,
      { title: `${analysis.sourceName}/${analysis.label}`, body, slug, format: "markdown", public: 0 },
      `Update schedule: ${slug}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    return { ok: true, docId };
  } else {
    // 创建新文档
    const result = await apiPost(
      `/repos/${bookId}/docs`,
      { title: `${analysis.sourceName}/${analysis.label}`, body, slug, format: "markdown", public: 0 },
      `Create schedule: ${slug}`,
    );
    if (isErrorResult(result)) {
      return { ok: false, error: JSON.stringify(result) };
    }
    const newId = (result as { data?: { id: number } })?.data?.id;
    return { ok: true, docId: newId };
  }
}

// ── 工具定义 ──

export const rssSchedule: McpTool = {
  name: "yuque_rss_schedule",
  description: "Analyze RSS feed recent update frequency and recommend next fetch time. 主方案：读取 RSS 配置知识库，分析最近更新频率，生成推荐抓取时间并写回。兜底方案：KV 去重数据。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Use yuque_rss_list_sources to list available sources." },
      kv_namespace: { type: "string", description: "KV namespace for fallback dedup data. Defaults to source key." },
      mode: { type: "string", description: "Mode: 'analyze' (analyze + write back, default) | 'dry_run' (analyze only, no write)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false)" },
    },
    required: ["source"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.source, "source"),
    );
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

    // 1. 加载 KV 数据（主方案和兜底方案都需要）
    if (!enableKv) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_DISABLED",
          message: "KV 功能未启用，无法读取历史数据进行分析",
          hint: "在 config.json 中设置 kv.enabled: true",
        }, null, 2) }],
        isError: true,
      };
    }

    const kvMap = await loadKvMap(kvNamespace);
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
          warning: "KV 中数据为旧格式（无时间戳），无法按作者分析频率。建议重新抓取以生成带时间戳的记录。",
          fallback_recommendation: {
            strategy: "保守策略",
            interval: "每 7 天抓取一次",
            reason: "无历史频率数据，使用默认间隔",
          },
        }, null, 2) }],
      };
    }

    const now = new Date();

    // 2. 确定方案：主方案 = 配置知识库，兜底 = 纯 KV 分析
    const scheduleBookId = getScheduleBookId();
    const analysisMode = scheduleBookId ? "schedule_book" : "kv_fallback";

    // 3. 分析每个 feed
    const analyses: FeedAnalysis[] = [];

    for (const [feedKey, feed] of Object.entries(src.feeds)) {
      const { count: recent7d, authors: authors7d } = countRecent(articles, 7, now);
      const { count: recent14d, authors: authors14d } = countRecent(articles, 14, now);
      const { count: recent30d, authors: authors30d } = countRecent(articles, 30, now);

      const band = classifyBand(recent7d, recent14d, recent30d);

      let lastFetch: string | null = null;
      if (scheduleBookId) {
        const slug = buildSlug(source, feedKey);
        const existing = await readScheduleDoc(scheduleBookId, slug);
        lastFetch = existing.lastFetch;
      }

      const nextFetchDate = new Date(now.getTime() + band.intervalDays * 24 * 60 * 60 * 1000);

      analyses.push({
        source,
        sourceName: src.name,
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

    // 4. 主方案：写回配置知识库
    const writeResults: Array<{ feed: string; status: string; docId?: number; error?: string }> = [];
    if (analysisMode === "schedule_book" && mode !== "dry_run" && scheduleBookId) {
      for (const analysis of analyses) {
        const slug = buildSlug(analysis.source, analysis.feed);
        const result = await upsertScheduleDoc(scheduleBookId, slug, analysis);
        writeResults.push({
          feed: analysis.feed,
          status: result.ok ? "updated" : "failed",
          docId: result.docId,
          error: result.error,
        });
      }
    }

    // 5. 汇总
    const summary = {
      high: analyses.filter((a) => a.band === "高频").length,
      mid: analyses.filter((a) => a.band === "中频").length,
      low: analyses.filter((a) => a.band === "低频").length,
      dormant: analyses.filter((a) => a.band === "休眠").length,
    };

    const result: ScheduleResult = {
      source,
      sourceName: src.name,
      mode: analysisMode,
      scheduleBookId: scheduleBookId || undefined,
      analyses,
      summary,
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(
          mode === "dry_run" || analysisMode === "kv_fallback"
            ? { ...result, writeResults: writeResults.length > 0 ? writeResults : undefined }
            : { ...result, writeResults },
          null, 2,
        ),
      }],
    };
  },
};