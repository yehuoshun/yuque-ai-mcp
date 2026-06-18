/**
 * crawler/schedule — 爬虫定时抓取策略分析
 *
 * 与 rss/schedule 共用 schedule-common.ts 公共逻辑。
 * 频率分档（保守策略，最小间隔 1 天）：
 *   - 高频：近 7 天 ≥5 篇 → 每天 1 次
 *   - 中频：近 7 天 1-4 篇 → 每 7 天
 *   - 低频：近 14 天 1 篇 → 每 15 天
 *   - 休眠：近 30 天 0 篇 → 每 30 天
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { loadKvMap } from "../kv/common.js";
import {
  BANDS,
  classifyBand,
  parseArticles,
  countRecent,
  getScheduleSlugs,
  findScheduleDoc,
  upsertScheduleDoc,
} from "../common/schedule-common.js";

const CRAWLER_SCHEDULE_SLUG = "crawler-schedule";

// ── Crawler 专用：schedule body 构建 ──

function buildCrawlScheduleBody(
  source: string,
  lastFetch: string | null,
  nextFetch: string,
  band: { label: string; intervalDays: number },
  recent7d: number,
  recent14d: number,
  recent30d: number,
): string {
  const lines: string[] = [];
  lines.push(`# 爬虫/${source}`);
  lines.push("");
  lines.push(`- 类型: crawler`);
  lines.push(`- 数据源: ${source}`);
  lines.push(`- 上次抓取: ${lastFetch || "无记录"}`);
  lines.push(`- 推荐下次抓取: ${nextFetch}`);
  lines.push(`- 抓取间隔: ${band.intervalDays}天`);
  lines.push(`- 频率分档: ${band.label}`);
  lines.push(`- 近7天文章数: ${recent7d}`);
  lines.push(`- 近14天文章数: ${recent14d}`);
  lines.push(`- 近30天文章数: ${recent30d}`);
  return lines.join("\n");
}

// ── 工具定义 ──

export const crawlSchedule: McpTool = {
  name: "yuque_crawl_schedule",
  description: "Analyze crawler recent fetch frequency from KV dedup data and recommend next fetch interval. 通过 config.json crawler.namespaces.{source}.schedule_slugs 定位配置文档。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'." },
      kv_namespace: { type: "string", description: "KV namespace for dedup data. Defaults to source." },
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

    if (!enableKv) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "KV_DISABLED", message: "KV 功能未启用",
        }, null, 2) }],
        isError: true,
      };
    }

    const kvMap = await loadKvMap("crawler", kvNamespace);
    const totalEntries = Object.keys(kvMap).length;

    if (totalEntries === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_DATA",
          message: `KV namespace '${kvNamespace}' 中没有数据`,
          hint: "先用 yuque_crawl_save 抓取一些文章后再调用此工具",
        }, null, 2) }],
        isError: true,
      };
    }

    const articles = parseArticles(kvMap);

    if (articles.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source, kv_namespace: kvNamespace, total_articles: totalEntries,
          warning: "KV 中数据为旧格式（无时间戳），无法分析频率。",
          fallback_recommendation: { strategy: "保守策略", interval: "每 7 天" },
        }, null, 2) }],
      };
    }

    const now = new Date();
    const recent7d = countRecent(articles, 7, now);
    const recent14d = countRecent(articles, 14, now);
    const recent30d = countRecent(articles, 30, now);
    const band = classifyBand(recent7d, recent14d);

    const hasScheduleSlugs = getScheduleSlugs("crawler", source).length > 0;
    const analysisMode = hasScheduleSlugs ? "schedule_book" : "kv_fallback";

    let lastFetch: string | null = null;
    if (hasScheduleSlugs) {
      const found = await findScheduleDoc("crawler", source, CRAWLER_SCHEDULE_SLUG);
      lastFetch = found.lastFetch;
    }

    const nextFetchDate = new Date(now.getTime() + band.intervalDays * 24 * 60 * 60 * 1000);
    const nextFetch = nextFetchDate.toISOString().slice(0, 10);

    let writeResult: { status: string; slug?: string; error?: string } | undefined;
    if (analysisMode === "schedule_book" && mode !== "dry_run") {
      const title = `爬虫/${source}`;
      const body = buildCrawlScheduleBody(source, lastFetch, nextFetch, band, recent7d, recent14d, recent30d);
      const result = await upsertScheduleDoc("crawler", source, CRAWLER_SCHEDULE_SLUG, title, body);
      writeResult = {
        status: result.ok ? "updated" : "failed",
        slug: result.slug,
        error: result.error,
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          source,
          mode: analysisMode,
          analysis: {
            band: band.label,
            intervalDays: band.intervalDays,
            lastFetch,
            nextFetch,
            recent7dCount: recent7d,
            recent14dCount: recent14d,
            recent30dCount: recent30d,
            totalArticles: totalEntries,
          },
          writeResult,
        }, null, 2),
      }],
    };
  },
};