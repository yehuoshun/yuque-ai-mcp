/**
 * rss/schedule — 定时抓取策略分析
 *
 * 职责：根据 KV 中已抓取文章的时间戳，分析各作者的更新频率，
 * 按频率分档规划抓取间隔，输出结构化策略建议。
 *
 * 频率分档：
 *   - 高频（日更/隔日更）：每 6h 抓一次
 *   - 中频（3-7 天）：每 12h 抓一次
 *   - 低频（7-30 天）：每天 1 次
 *   - 休眠（>30 天未更新）：每 3 天 1 次
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { RSS_SOURCES, type RssFeed } from "./sources.js";
import { loadKvMap } from "../kv/common.js";

/** 频率分档 */
interface FrequencyBand {
  label: string;
  range: string;
  interval: string;
  intervalHours: number;
  authors: string[];
}

/** 作者统计 */
interface AuthorStats {
  name: string;
  articleCount: number;
  firstSeen: string;
  lastSeen: string;
  avgIntervalDays: number;
  band: string;
}

/** 策略结果 */
interface ScheduleResult {
  namespace: string;
  source: string;
  sourceName: string;
  totalAuthors: number;
  totalArticles: number;
  bands: FrequencyBand[];
  recommendations: Array<{
    feed: string;
    label: string;
    frequency: string;
    reason: string;
  }>;
  authors: AuthorStats[];
}

/** 从 KV 中解析文章时间戳 */
function parseTimestamps(kvMap: Record<string, string>): Array<{ author: string; date: Date }> {
  const entries: Array<{ author: string; date: Date }> = [];
  for (const [slug, value] of Object.entries(kvMap)) {
    try {
      const meta = JSON.parse(value);
      if (meta.date) {
        entries.push({ author: meta.author || "未知", date: new Date(meta.date) });
      }
    } catch {
      // 旧格式：value 直接是 link，没有时间戳，跳过
      continue;
    }
  }
  return entries;
}

/** 按作者分组，计算平均更新间隔 */
function analyzeAuthors(
  entries: Array<{ author: string; date: Date }>,
): AuthorStats[] {
  const byAuthor: Record<string, Date[]> = {};
  for (const e of entries) {
    if (!byAuthor[e.author]) byAuthor[e.author] = [];
    byAuthor[e.author].push(e.date);
  }

  const now = new Date();
  const stats: AuthorStats[] = [];

  for (const [author, dates] of Object.entries(byAuthor)) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const lastSeen = dates[dates.length - 1];
    const daysSinceLast = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);

    let avgIntervalDays = 0;
    if (dates.length >= 2) {
      let totalGap = 0;
      for (let i = 1; i < dates.length; i++) {
        totalGap += (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      }
      avgIntervalDays = totalGap / (dates.length - 1);
    }

    // 频率分档
    let band: string;
    if (avgIntervalDays <= 2 && avgIntervalDays > 0) band = "高频";
    else if (avgIntervalDays <= 7 && avgIntervalDays > 0) band = "中频";
    else if (avgIntervalDays <= 30 && avgIntervalDays > 0) band = "低频";
    else if (daysSinceLast > 30) band = "休眠";
    else band = "低频"; // 数据不足，保守估计

    // 单篇文章但最近更新的 → 暂定中频
    if (dates.length === 1 && daysSinceLast <= 7) band = "中频";
    if (dates.length === 1 && daysSinceLast > 7) band = "低频";

    stats.push({
      name: author,
      articleCount: dates.length,
      firstSeen: dates[0].toISOString().slice(0, 10),
      lastSeen: lastSeen.toISOString().slice(0, 10),
      avgIntervalDays: Math.round(avgIntervalDays * 10) / 10,
      band,
    });
  }

  return stats.sort((a, b) => b.articleCount - a.articleCount);
}

/** 按频率分档分组 */
function groupByBand(stats: AuthorStats[]): FrequencyBand[] {
  const bands: Record<string, { authors: string[]; intervalHours: number; interval: string; range: string; label: string }> = {
    "高频": { label: "高频", range: "≤2 天", interval: "每 6h", intervalHours: 6, authors: [] },
    "中频": { label: "中频", range: "3-7 天", interval: "每 12h", intervalHours: 12, authors: [] },
    "低频": { label: "低频", range: "7-30 天", interval: "每天 1 次", intervalHours: 24, authors: [] },
    "休眠": { label: "休眠", range: ">30 天未更新", interval: "每 3 天 1 次", intervalHours: 72, authors: [] },
  };

  for (const s of stats) {
    if (bands[s.band]) {
      bands[s.band].authors.push(s.name);
    }
  }

  return Object.values(bands).filter((b) => b.authors.length > 0);
}

/** 生成各 feed 的推荐策略 */
function recommendFeeds(
  source: string,
  bands: FrequencyBand[],
): Array<{ feed: string; label: string; frequency: string; reason: string }> {
  const src = RSS_SOURCES[source];
  if (!src) return [];

  const recommendations: Array<{ feed: string; label: string; frequency: string; reason: string }> = [];

  for (const [feedKey, feed] of Object.entries(src.feeds)) {
    let frequency: string;
    let reason: string;

    switch (feedKey) {
      case "sitehome":
      case "picked":
        // 首页/推荐 → 高频，文章更新快
        frequency = "每 6h";
        reason = "首页/推荐内容更新频繁，建议高频抓取";
        break;
      case "48h":
      case "10d":
        // 排行类 → 中频，排行榜变动有周期
        frequency = "每 12h";
        reason = "排行榜内容有固定更新周期，中频即可";
        break;
      case "user":
      case "category":
        // 用户/分类 → 看作者整体频率
        if (bands.length > 0) {
          const topBand = bands[0].label;
          if (topBand === "高频") { frequency = "每 6h"; reason = "作者整体更新频率高"; }
          else if (topBand === "中频") { frequency = "每 12h"; reason = "作者整体更新频率中等"; }
          else { frequency = "每天 1 次"; reason = "作者整体更新频率较低"; }
        } else {
          frequency = "每天 1 次";
          reason = "无历史数据，保守估计";
        }
        break;
      default:
        frequency = "每 12h";
        reason = "默认策略";
    }

    recommendations.push({
      feed: feedKey,
      label: feed.label,
      frequency,
      reason,
    });
  }

  return recommendations;
}

export const rssSchedule: McpTool = {
  name: "yuque_rss_schedule",
  description: "Analyze RSS author update frequency from KV dedup data and recommend optimal fetch intervals. Use to plan cron schedules. 调用前需确保 KV 中有已抓取的时间戳数据。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Use yuque_rss_list_sources to list available sources." },
      kv_namespace: { type: "string", description: "KV namespace for reading dedup data, e.g. 'cnblogs'. Defaults to source key." },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
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
          message: "KV 功能未启用，无法读取历史数据进行分析",
          hint: "在 config.json 中设置 kv.enabled: true",
        }, null, 2) }],
        isError: true,
      };
    }

    // 1. 加载 KV 去重数据
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

    // 2. 解析时间戳
    const entries = parseTimestamps(kvMap);

    // 如果旧格式没有时间戳，回退到仅统计数量
    if (entries.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source: src.name,
          kv_namespace: kvNamespace,
          total_articles: totalEntries,
          warning: "KV 中数据为旧格式（无时间戳），无法按作者分析频率。建议重新抓取以生成带时间戳的记录。",
          fallback_recommendation: {
            strategy: "保守策略",
            interval: "每 12h 抓取一次",
            reason: "无历史频率数据，使用默认间隔",
          },
        }, null, 2) }],
      };
    }

    // 3. 分析作者频率
    const authors = analyzeAuthors(entries);
    const bands = groupByBand(authors);
    const recommendations = recommendFeeds(source, bands);

    const result: ScheduleResult = {
      namespace: kvNamespace,
      source,
      sourceName: src.name,
      totalAuthors: authors.length,
      totalArticles: totalEntries,
      bands,
      recommendations,
      authors,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
};