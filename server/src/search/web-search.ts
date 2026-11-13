/**
 * search/web-search — Cookie 态 Web 搜索
 *
 * 端点：GET /api/zsearch（Web API，Cookie 认证）
 * 职责：搜索文档/知识库/用户，返回完整 _record 对象（无需二次 get_doc）
 *
 * 相比 API v2 搜索的优势：
 *   - 返回完整文档对象（_record），省去二次查询
 *   - 精确 totalHits 总数
 *   - 高亮摘要 abstract
 *   - 支持 type=user 搜索用户
 *
 * ⚠️ 限流：单次请求，不做并发。Cookie 态 QPS 未知，保守策略。
 */

import type { McpTool } from "../common/types.js";
import { isErrorResult } from "../common/api-client.js";
import { webRequest } from "../common/web-request.js";
import { requiredString, oneOf, positiveInt, maxValue } from "../common/validate.js";

// ─── 格式化 ────────────────────────────────────

interface ZsearchHit {
  abstract?: string;
  book_name?: string;
  group_name?: string;
  id: number;
  privacy?: number;
  slug?: string;
  title?: string;
  type?: string;
  url?: string;
  _record?: Record<string, unknown>;
}

interface ZsearchResponse {
  data?: {
    type?: string;
    hits?: ZsearchHit[];
    totalHits?: number;
    numHits?: number;
    errorHits?: number;
    message?: string;
    info?: string;
  };
}

function formatWebSearchResult(hit: ZsearchHit) {
  const rec = hit._record;
  return {
    id: hit.id,
    title: hit.title ?? "",
    abstract: hit.abstract?.replace(/<em>|<\/em>/g, "") ?? "",
    abstract_html: hit.abstract ?? "",
    type: hit.type ?? "",
    url: hit.url ?? "",
    book_name: hit.book_name ?? "",
    group_name: hit.group_name ?? "",
    slug: hit.slug ?? "",
    privacy: hit.privacy,
    // 精简版 _record，去掉冗余字段
    doc: rec ? {
      id: rec.id,
      slug: rec.slug,
      title: rec.title,
      format: rec.format,
      word_count: rec.word_count,
      book_id: rec.book_id,
      user_id: rec.user_id,
      description: rec.description,
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      content_updated_at: rec.content_updated_at,
      status: rec.status,
      public: rec.public,
      comments_count: rec.comments_count,
      likes_count: rec.likes_count,
      read_count: rec.read_count,
    } : null,
  };
}

// ─── Tool 定义 ────────────────────────────────────

export const searchWeb: McpTool = {
  name: "yuque_web_search",
  description:
    "Cookie-based web search across Yuque docs/books/users. " +
    "Returns full document objects (_record) without needing a second get_doc call. " +
    "Supports scope filtering (repo/group), type filtering (content/book/user), pagination, " +
    "AND advanced search syntax: \"phrase\", in:title, NOT/AND/OR, updated:>YYYY-MM-DD, url:scope, is:related/public. " +
    "Requires cookie+ctoken in config. " +
    "GET /api/zsearch?q=:q&type=:type&scope=:scope&p=:p. " +
    "⚠️ Cookie-based API — QPS unknown, avoid concurrent calls. " +
    "详见 references/api/search_api.md",

  inputSchema: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "Search keyword (required). Supports advanced syntax: \"phrase\", in:title, NOT/AND/OR, updated:>YYYY-MM-DD, url:scope, is:related/public. 详见 references/api/search_api.md",
      },
      type: {
        type: "string",
        description: "Search type: content (docs) / book (repos) / user (users). Default: content",
      },
      scope: {
        type: "string",
        description:
          "Search scope. Root '/' for global, '/group_slug' for team, '/group_slug/book_slug' for a repo. Default: /",
      },
      p: {
        type: "number",
        description: "Page number (1-based, default 1, max 100)",
      },
    },
    required: ["q"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.q, "q")
      || oneOf(args?.type, "type", ["content", "book", "user"])
      || positiveInt(args?.p, "p")
      || maxValue(args?.p, "p", 100);
    if (__v) return __v;

    const q = args?.q as string;
    const type = (args?.type as string) ?? "content";
    const scope = (args?.scope as string) ?? "/";
    const p = (args?.p as number) ?? 1;

    // 构建 URL（scope 需要 URL 编码）
    const encodedScope = encodeURIComponent(scope);
    const encodedQ = encodeURIComponent(q);
    const url = `https://www.yuque.com/api/zsearch?q=${encodedQ}&type=${type}&scope=${encodedScope}&p=${p}&sence=searchPage`;

    const result = await webRequest(url, {
      method: "GET",
      referer: `https://www.yuque.com/search?q=${encodedQ}&type=${type}&scope=${encodedScope}&p=${p}&sence=searchPage`,
    });

    if (isErrorResult(result)) return result;

    const data = result as ZsearchResponse;
    const hits = data?.data?.hits ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              meta: {
                total: data?.data?.totalHits ?? hits.length,
                num_hits: data?.data?.numHits ?? hits.length,
                page: p,
                type,
                scope,
                q,
              },
              data: hits.map(formatWebSearchResult),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
