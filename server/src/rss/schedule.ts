/**
 * rss/schedule — 定时抓取策略分析
 *
 * 主方案：读取 RSS 配置知识库（config.json 中 rss.namespaces.{source}.schedule_slugs），
 * 分析每个 feed 的最近更新频率，生成推荐下次抓取时间，写回知识库。
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
import { getRssSources } from "./sources.js";
import { loadKvMap } from "../kv/common.js";
import {
  BANDS,
  classifyBand,
  parseArticles,
  countRecentWithAuthors,
  getScheduleSlugs,
  findScheduleDoc,
  upsertScheduleDoc,
} from "../common/schedule-common.js";

// ── RSS 专用：schedule body 构建 ──

function buildRssScheduleBody(
  sourceName: string,
  label: string,
  source: string,
  feed: string,
  lastFetch: string | null,
  nextFetch: string,
  band: { label: string; intervalDays: number },
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

// ── 工具定义 ──

export const rssSchedule: McpTool = {
  name: "yuque_rss_schedule",
  description: "Analyze RSS feed recent update frequency and recommend next fetch time. 主方案：读取 schedule_slugs 配置知识库，分析最近更新频率，生成推荐抓取时间并写回。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key. Use yuque_rss_list_sources to list available sources." },
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

    const src = getRssSources()[source];
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
    const hasScheduleSlugs = getScheduleSlugs("rss", source).length > 0;
    const analysisMode = hasScheduleSlugs ? "schedule_book" : "kv_fallback";

    const analyses: Array<{
      feed: string; label: string; lastFetch: string | null; nextFetch: string;
      intervalDays: number; band: string; recent7dCount: number; recent14dCount: number;
      recent30dCount: number; activeAuthors: string[];
    }> = [];

    for (const [feedKey, feed] of Object.entries(src.feeds)) {
      const feedArticles = articles.filter((a) => a.feed === feedKey);
      const { count: recent7d, authors: authors7d } = countRecentWithAuthors(feedArticles, 7, now);
      const recent14d = countRecentWithAuthors(feedArticles, 14, now).count;
      const recent30d = countRecentWithAuthors(feedArticles, 30, now).count;
      const band = classifyBand(recent7d, recent14d);

      let lastFetch: string | null = null;
      if (hasScheduleSlugs) {
        const feedSlug = `${source}--${feedKey}`;
        const found = await findScheduleDoc("rss", source, feedSlug);
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

    const writeResults: Array<{ feed: string; status: string; slug?: string; error?: string }> = [];
    if (analysisMode === "schedule_book" && mode !== "dry_run") {
      for (const analysis of analyses) {
        const feedSlug = `${source}--${analysis.feed}`;
        const title = `${src.name}/${analysis.label}`;
        const body = buildRssScheduleBody(
          src.name, analysis.label, source, analysis.feed,
          analysis.lastFetch, analysis.nextFetch,
          { label: analysis.band, intervalDays: analysis.intervalDays },
          analysis.recent7dCount, analysis.recent14dCount, analysis.recent30dCount,
          analysis.activeAuthors,
        );
        const result = await upsertScheduleDoc("rss", source, feedSlug, title, body);
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