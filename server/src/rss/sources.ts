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
          username: { type: "string", description: "博客园用户名，如 hsewr333", required: true },
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
};