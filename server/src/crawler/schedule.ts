/**
 * crawler/schedule — 爬虫定时抓取策略分析
 *
 * 与 rss/schedule 共用同一个配置知识库（config.json rss.schedule.book_id）。
 * 文档 slug 格式：crawler--{source}
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
import { loadKvMap } from "../kv/common.js";

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
  date: Date;
  link: string;
}

function parseArticles(kvMap: Record<string, string>): ArticleMeta[] {
  const articles: ArticleMeta[] = [];
  for (const [, value] of Object.entries(kvMap)) {
    try {
      const meta = JSON.parse(value);
      if (meta.date) {
        articles.push({ date: new Date(meta.date), link: meta.link || "" });
      }
    } catch {
      // 旧格式，跳过
    }
  }
  return articles.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function countRecent(articles: ArticleMeta[], days: number, now: Date): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return articles.filter((a) => a.date >= cutoff).length;
}

// ── 配置知识库操作 ──

function getScheduleBookId(): number | null {
  const cfg = loadConfig();
  if (!cfg.rss?.schedule?.book_id) return null;
  return cfg.rss.schedule.book_id;
}

function buildSlug(source: string): string {
  return `crawler--${source}`;
}

async function readScheduleDoc(
  bookId: number,
  slug: string,
): Promise<{ docId: number | null; lastFetch: string | null }> {
  const searchData = await apiGet(
    `/repos/${bookId}/docs?q=${encodeURIComponent(slug)}`,
    undefined,
    `Search schedule: ${slug}`,
  );
  if (isErrorResult(searchData)) return { docId: null, lastFetch: null };

  const docs = (searchData as { data?: Array<{ id: number; slug: string; body?: string }> })?.data || [];
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return { docId: null, lastFetch: null };

  const body = doc.body || "";
  const m = body.match(/上次抓取:\s*(.+)/);
  const lastFetch = m ? m[1].trim().slice(0, 10) : null;

  return { docId: doc.id, lastFetch };
}

function buildScheduleBody(
  source: string,
  lastFetch: string | null,
  nextFetch: string,
  band: BandRule,
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

async function upsertScheduleDoc(
  bookId: number,
  slug: string,
  source: string,
  lastFetch: string | null,
  nextFetch: string,
  band: BandRule,
  recent7d: number,
  recent14d: number,
  recent30d: number,
): Promise<{ ok: boolean; docId?: number; error?: string }> {
  const body = buildScheduleBody(source, lastFetch, nextFetch, band, recent7d, recent14d, recent30d);
  const { docId } = await readScheduleDoc(bookId, slug);

  if (docId) {
    const result = await apiPut(
      `/repos/${bookId}/docs/${docId}`,
      { title: `爬虫/${source}`, body, slug, format: "markdown", public: 0 },
      `Update schedule: ${slug}`,
    );
    if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
    return { ok: true, docId };
  } else {
    const result = await apiPost(
      `/repos/${bookId}/docs`,
      { title: `爬虫/${source}`, body, slug, format: "markdown", public: 0 },
      `Create schedule: ${slug}`,
    );
    if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
    const newId = (result as { data?: { id: number } })?.data?.id;
    return { ok: true, docId: newId };
  }
}

// ── 工具定义 ──

export const crawlSchedule: McpTool = {
  name: "yuque_crawl_schedule",
  description: "Analyze crawler recent fetch frequency from KV dedup data and recommend next fetch interval. 与 rss/schedule 共用配置知识库，文档 slug 前缀 crawler--。",

  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "Source key, e.g. 'cnblogs'. Used for KV namespace lookup and schedule doc slug." },
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
          error: "KV_DISABLED",
          message: "KV 功能未启用",
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
          hint: "先用 yuque_crawl_save 抓取一些文章后再调用此工具",
        }, null, 2) }],
        isError: true,
      };
    }

    const articles = parseArticles(kvMap);

    if (articles.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source,
          kv_namespace: kvNamespace,
          total_articles: totalEntries,
          warning: "KV 中数据为旧格式（无时间戳），无法分析频率。建议重新抓取以生成带时间戳的记录。",
          fallback_recommendation: {
            strategy: "保守策略",
            interval: "每 7 天抓取一次",
            reason: "无历史频率数据，使用默认间隔",
          },
        }, null, 2) }],
      };
    }

    const now = new Date();
    const recent7d = countRecent(articles, 7, now);
    const recent14d = countRecent(articles, 14, now);
    const recent30d = countRecent(articles, 30, now);
    const band = classifyBand(recent7d, recent14d);

    const scheduleBookId = getScheduleBookId();
    const analysisMode = scheduleBookId ? "schedule_book" : "kv_fallback";

    let lastFetch: string | null = null;
    if (scheduleBookId) {
      const slug = buildSlug(source);
      const existing = await readScheduleDoc(scheduleBookId, slug);
      lastFetch = existing.lastFetch;
    }

    const nextFetchDate = new Date(now.getTime() + band.intervalDays * 24 * 60 * 60 * 1000);
    const nextFetch = nextFetchDate.toISOString().slice(0, 10);

    // 写回配置知识库
    let writeResult: { status: string; docId?: number; error?: string } | undefined;
    if (analysisMode === "schedule_book" && mode !== "dry_run" && scheduleBookId) {
      const slug = buildSlug(source);
      const result = await upsertScheduleDoc(
        scheduleBookId, slug, source, lastFetch, nextFetch,
        band, recent7d, recent14d, recent30d,
      );
      writeResult = {
        status: result.ok ? "updated" : "failed",
        docId: result.docId,
        error: result.error,
      };
    }

    const output = {
      source,
      mode: analysisMode,
      scheduleBookId: scheduleBookId || undefined,
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
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
    };
  },
};