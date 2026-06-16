/**
 * rss/list-sources — 列出所有可用 RSS 数据源
 *
 * 无参数，直接返回 sources.ts 中的配置。
 * Agent 调用 fetch 前先调这个了解有哪些源可用。
 */

import type { McpTool } from "../common/types.js";
import { RSS_SOURCES } from "./sources.js";

export const rssListSources: McpTool = {
  name: "yuque_rss_list_sources",
  description: "List all available RSS sources and their feed types. Call before yuque_rss_fetch. 详见 references/api/extended_api.md",

  async handler() {
    const sources = Object.entries(RSS_SOURCES).map(([key, src]) => ({
      key,
      name: src.name,
      description: src.description,
      feeds: Object.entries(src.feeds).map(([feedKey, feed]) => ({
        key: feedKey,
        label: feed.label,
        description: feed.description,
        has_template: !!feed.url_template,
        params: feed.params_schema
          ? Object.entries(feed.params_schema).map(([k, v]) => ({
              name: k,
              type: v.type,
              description: v.description,
              required: v.required,
            }))
          : [],
      })),
    }));

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ sources, total: sources.length }, null, 2),
      }],
    };
  },
};