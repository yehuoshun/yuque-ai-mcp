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

  sspai: {
    name: "少数派",
    description: "高效工作，品质生活 — 数字产品与效率工具深度评测",
    slugResolver: (link: string) => {
      const m = link.match(/\/post\/(\d+)/);
      return m ? `sspai-${m[1]}` : null;
    },
    feeds: {
      all: {
        label: "全部文章",
        description: "少数派全部最新文章",
        url: "https://sspai.com/feed",
      },
    },
  },

  ruanyifeng: {
    name: "阮一峰的网络日志",
    description: "阮一峰的技术博客与科技爱好者周刊",
    slugResolver: (link: string) => {
      // 提取 /blog/YYYY/MM/xxx.html 中的文件名
      const m = link.match(/\/blog\/(\d{4})\/(\d{2})\/(.+)\.html/);
      return m ? `ruanyf-${m[1]}${m[2]}-${m[3]}` : null;
    },
    feeds: {
      blog: {
        label: "博客",
        description: "阮一峰个人博客（含科技爱好者周刊）",
        url: "https://www.ruanyifeng.com/blog/atom.xml",
      },
    },
  },

  ithome: {
    name: "IT之家",
    description: "软媒旗下科技资讯平台，实时IT新闻",
    slugResolver: (link: string) => {
      const m = link.match(/\/0\/(\d+)\/(\d+)\.htm/);
      return m ? `ithome-${m[1]}-${m[2]}` : null;
    },
    feeds: {
      news: {
        label: "最新资讯",
        description: "IT之家最新科技资讯",
        url: "https://www.ithome.com/rss/",
      },
    },
  },

  appinn: {
    name: "小众软件",
    description: "分享免费、小巧、实用、有趣、绿色的软件",
    slugResolver: (link: string) => {
      const m = link.match(/\/(\d+)\/$/);
      return m ? `appinn-${m[1]}` : null;
    },
    feeds: {
      all: {
        label: "全部文章",
        description: "小众软件全部最新文章",
        url: "https://feeds.appinn.com/appinns/",
      },
    },
  },
};