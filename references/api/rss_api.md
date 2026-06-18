# RSS API 参考

> RSS 抓取域，不直接调用语雀 API 端点，而是抓取外部 RSS/Atom Feed 后写入语雀。

## 端点

### yuque_rss_list_sources

```
无（RSS 数据源列表）
```

列出所有可用 RSS 数据源及 feed 类型。

**无参数**。

**响应示例**：
```json
{
  "sources": [
    {
      "key": "cnblogs",
      "name": "博客园",
      "description": "开发者的网上家园，技术博客聚合平台",
      "feeds": [
        {
          "key": "sitehome",
          "label": "首页最新",
          "has_template": false,
          "params": []
        },
        {
          "key": "user",
          "label": "用户博客",
          "has_template": true,
          "params": [
            { "name": "username", "type": "string", "required": true }
          ]
        }
      ]
    }
  ]
}
```

### yuque_rss_fetch

```
无（RSS 抓取写入）
```

抓取 RSS/Atom Feed，语雀 KV slug 去重后写入目标知识库。

**参数**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|:--:|------|------|
| source | string | ✅ | - | 数据源 key，如 `cnblogs` |
| feed_type | string | ✅ | - | feed 类型，如 `sitehome`、`picked` |
| feed_params | object | ❌ | - | 模板参数，如 `{ username: "hsewr333" }` |
| target_repo | string | ❌ | config | RSS 目标知识库，不传从 config.json `rss` 读 |
| kv_repo | string | ❌ | config | KV 去重知识库，不传从 config.json `kv` 读 |
| max_items | number | ❌ | 10 | 最大抓取数，上限 50 |
| mode | string | ❌ | `append` | `append` / `dry_run` |
| title_prefix | string | ❌ | - | 文档标题前缀，如 `[博客园] ` |

**响应示例**（dry_run）：
```json
{
  "mode": "dry_run",
  "source": "博客园 / 首页最新",
  "feed_url": "https://feed.cnblogs.com/blog/sitehome/rss",
  "feed_title": "博客园_首页",
  "total": 3,
  "entries": [
    { "title": "...", "link": "https://...", "slug": "cnblogs-20538011", "author": "...", "published": "..." }
  ]
}
```

**响应示例**（append）：
```json
{
  "source": "博客园 / 首页最新",
  "feed_url": "https://feed.cnblogs.com/blog/sitehome/rss",
  "target_repo": "123456",
  "kv_repo": "123456",
  "fetched": 10,
  "new": 3,
  "skipped": 7,
  "dedup": { "strategy": "yuque-kv-slug" },
  "results": [
    { "title": "...", "link": "...", "slug": "cnblogs-20538011", "doc_id": 12345, "status": "created" }
  ]
}
```

## 去重机制

**语雀 KV slug 方案**：每篇文章以 `{source}-{site_article_id}` 作为文档 slug，通过 `GET /repos/{kv_repo}/docs/{slug}` 判断是否已存在。O(1) 单次 API 调用，无文档数量上限。

博客园：`https://www.cnblogs.com/xxx/p/20538011` → slug `cnblogs-20538011`

其他数据源 fallback 到 `md5(link).slice(0, 12)`。

## 配置

```json
{
  "rss": {
    "enabled": true,
    "default_repo": { "book_id": "123456", "namespace": "my-group/default" },
    "sources": {
      "cnblogs": { "book_id": "123456" }
    }
  },
  "kv": {
    "enabled": false,
    "default_repo": { "book_id": "789012", "namespace": "my-group/kv" }
  }
}
```

- `rss`：RSS 文章写入的目标知识库，`enabled` 控制是否启用
- `kv`：去重 slug 查询的知识库，`enabled=true` 时启用去重
- `target_repo` / `kv_repo` 参数不传时自动从配置读取

## 使用场景

1. **信息聚合**：定期抓取技术博客到语雀知识库，建立个人技术情报站
2. **监控关注作者**：用 `user` feed + 定时任务，自动追踪指定作者的更新
3. **分类订阅**：按技术分类抓取，如只关注 `.NET` 分类的文章

## 扩展新数据源

编辑 `server/src/rss/sources.ts`，追加条目即可，无需改 tool 代码：

```ts
"new_source": {
  name: "新数据源",
  slugResolver: (link) => { /* 提取站点 ID */ },
  feeds: {
    main: { label: "主 feed", url: "https://example.com/rss" },
    user: {
      label: "用户",
      url_template: "https://example.com/user/{username}/rss",
      params_schema: {
        username: { type: "string", description: "用户名", required: true },
      },
    },
  },
},
```