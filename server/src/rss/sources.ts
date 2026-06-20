/**
 * rss/sources — 数据源配置
 *
 * 新增数据源只需在此文件追加一个条目，无需改 tool 代码。
 */

export interface RssFeed {
  label: string;
  description?: string;
  url?: string;
  url_template?: string;
  params_schema?: Record<string, ParamDef>;
}

export interface ParamDef {
  type: "string" | "number";
  description: string;
  required?: boolean;
  default?: string | number;
}

export interface RssSource {
  name: string;
  description?: string;
  feeds: Record<string, RssFeed>;
  /** 从文章链接提取站点文章 ID，生成 slug 用于去重。返回 null 则 fallback 到 md5(link) */
  slugResolver?: (link: string) => string | null;
}

export const RSS_SOURCES: Record<string, RssSource> = {
  // 示例：博客园。新增数据源只需在此追加一个 key，无需改 tool 代码。
  // Example: cnblogs. Add new sources by appending a key here — no tool code changes needed.
  cnblogs: {
    name: "博客园",
    description: "开发者的网上家园，技术博客聚合平台",
    slugResolver: (link: string) => {
      const m = link.match(/\/p\/(\d+)/);
      return m ? `cnblogs-${m[1]}` : null;
    },
    feeds: {
      sitehome: {
        label: "首页最新",
        description: "博客园首页最新发布的文章",
        url: "https://feed.cnblogs.com/blog/sitehome/rss",
      },
      picked: {
        label: "编辑推荐",
        description: "博客园编辑精选推荐",
        url: "https://feed.cnblogs.com/blog/sitehome/picked",
      },
      "48h": {
        label: "48小时阅读排行",
        description: "博客园48小时内阅读量最高的文章",
        url: "https://feed.cnblogs.com/blog/sitehome/48h",
      },
      "10d": {
        label: "10天推荐排行",
        description: "博客园10天内推荐最多的文章",
        url: "https://feed.cnblogs.com/blog/sitehome/10d",
      },
      user: {
        label: "用户博客",
        description: "指定用户的博客文章",
        url_template: "https://feed.cnblogs.com/blog/u/{username}/rss",
        params_schema: {
          username: { type: "string", description: "博客园用户名", required: true },
        },
      },
      category: {
        label: "分类",
        description: "指定分类的文章",
        url_template: "https://feed.cnblogs.com/blog/category/{category}/rss",
        params_schema: {
          category: { type: "string", description: "分类名，如 dotnet, python, web", required: true },
        },
      },
    },
  },

  // 通用源：传 url 参数直接抓取任意 RSS/Atom Feed
  // Generic source: pass url param to fetch any RSS/Atom feed directly
  generic: {
    name: "通用 RSS",
    description: "通用 RSS/Atom Feed 抓取，传 url 参数指定 Feed 地址",
    slugResolver: undefined,
    feeds: {
      custom: {
        label: "自定义",
        description: "传入任意 RSS/Atom Feed URL",
        url_template: "{url}",
        params_schema: {
          url: { type: "string", description: "RSS/Atom Feed URL", required: true },
        },
      },
    },
  },
};