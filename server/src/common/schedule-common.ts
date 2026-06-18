/**
 * common/schedule-common — 定时策略公共逻辑
 *
 * 被 rss/schedule.ts 和 crawler/schedule.ts 共享：
 * - 频率分档（BANDS + classifyBand）
 * - KV 文章时间戳解析（parseArticles / countRecent）
 * - schedule_slugs 文档查找与创建（findScheduleDoc / upsertScheduleDoc）
 */

import { loadConfig, parseSlug, buildSlugStr } from "./config.js";
import { apiGet, apiPost, apiPut, isErrorResult } from "./api-client.js";
import { setScheduleSlugs } from "../kv/common.js";

// ── 频率分档 ──

export interface BandRule {
  label: string;
  range: string;
  intervalDays: number;
}

export const BANDS: BandRule[] = [
  { label: "高频", range: "近7天≥5篇", intervalDays: 1 },
  { label: "中频", range: "近7天1-4篇", intervalDays: 7 },
  { label: "低频", range: "近14天1篇", intervalDays: 15 },
  { label: "休眠", range: "近30天0篇", intervalDays: 30 },
];

export function classifyBand(recent7d: number, recent14d: number): BandRule {
  if (recent7d >= 5) return BANDS[0];
  if (recent7d >= 1 && recent7d <= 4) return BANDS[1];
  if (recent14d >= 1 && recent7d === 0) return BANDS[2];
  return BANDS[3];
}

// ── 文章时间戳解析 ──

export interface ArticleMeta {
  date: Date;
  link: string;
  author?: string;
  feed?: string;
}

export function parseArticles(kvMap: Record<string, string>): ArticleMeta[] {
  const articles: ArticleMeta[] = [];
  for (const [, value] of Object.entries(kvMap)) {
    try {
      const meta = JSON.parse(value);
      if (meta.date) {
        articles.push({
          date: new Date(meta.date),
          link: meta.link || "",
          author: meta.author || undefined,
          feed: meta.feed || undefined,
        });
      }
    } catch { /* 旧格式 */ }
  }
  return articles.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function countRecent(articles: ArticleMeta[], days: number, now: Date): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return articles.filter((a) => a.date >= cutoff).length;
}

export function countRecentWithAuthors(articles: ArticleMeta[], days: number, now: Date): { count: number; authors: string[] } {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recent = articles.filter((a) => a.date >= cutoff);
  return { count: recent.length, authors: [...new Set(recent.map((a) => a.author).filter(Boolean) as string[])] };
}

// ── schedule_slugs 操作 ──

export function getScheduleSlugs(domain: "rss" | "crawler", source: string): string[] {
  const cfg = loadConfig();
  return cfg[domain]?.namespaces?.[source]?.schedule_slugs ?? [];
}

export interface ScheduleDocInfo {
  slug: string | null;
  lastFetch: string | null;
}

export async function findScheduleDoc(
  domain: "rss" | "crawler",
  source: string,
  matchSlug: string,
): Promise<ScheduleDocInfo> {
  const slugs = getScheduleSlugs(domain, source);
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
    if (doc.slug === matchSlug) {
      const body = doc.body || "";
      const m = body.match(/上次抓取:\s*(.+)/);
      return { slug: s, lastFetch: m ? m[1].trim().slice(0, 10) : null };
    }
  }
  return { slug: null, lastFetch: null };
}

export async function upsertScheduleDoc(
  domain: "rss" | "crawler",
  source: string,
  matchSlug: string,
  title: string,
  body: string,
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const { slug: existingSlug } = await findScheduleDoc(domain, source, matchSlug);

  if (existingSlug) {
    const parsed = parseSlug(existingSlug);
    if (!parsed) return { ok: false, error: `无效 slug: ${existingSlug}` };
    const result = await apiPut(
      `/repos/${parsed.bookId}/docs/${parsed.docId}`,
      { title, body, slug: matchSlug, format: "markdown", public: 0 },
      `Update schedule: ${matchSlug}`,
    );
    if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
    return { ok: true, slug: existingSlug };
  }

  // 新建
  const slugs = getScheduleSlugs(domain, source);
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
    { title, body, slug: matchSlug, format: "markdown", public: 0 },
    `Create schedule: ${matchSlug}`,
  );
  if (isErrorResult(result)) return { ok: false, error: JSON.stringify(result) };
  const docId = (result as { data?: { id: number } })?.data?.id;
  if (!docId) return { ok: false, error: "创建文档后未获取到 doc_id" };

  const newSlug = buildSlugStr(bookId, docId);
  const newSlugs = [...slugs, newSlug];
  setScheduleSlugs(domain, source, newSlugs);
  return { ok: true, slug: newSlug };
}
