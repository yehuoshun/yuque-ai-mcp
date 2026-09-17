# Crawler API 参考

爬虫域工具，用于网页抓取、内容提取和写入语雀。

## 工具列表

| 工具 | 说明 |
|------|------|
| `yuque_crawl_fetch` | HTTP GET 抓取网页原始 HTML |
| `yuque_crawl_extract` | CSS 选择器从 HTML 提取内容 |
| `yuque_crawl_save` | 去重 + 写入语雀（接收 Agent 清洗后的内容） |
| `yuque_crawl_schedule` | 分析抓取频率，生成推荐抓取间隔并写回配置文档 |

## 使用流程

```
yuque_crawl_fetch → Agent 清洗 → yuque_crawl_save
```

## 定时抓取策略

`yuque_crawl_schedule` 分析 KV 去重数据中的时间戳，按文章产出频率分档推荐抓取间隔。

### 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|:----:|------|------|
| `source` | string | ✅ | - | 数据源 key，匹配 `crawler.namespaces.{source}.book_id` |
| `kv_namespace` | string | ❌ | source 值 | KV 命名空间，用于读取去重数据 |
| `mode` | string | ❌ | `analyze` | `analyze`（分析+写回）/ `dry_run`（仅分析） |
| `raw` | boolean | ❌ | false | 返回完整 JSON（默认 false） |

### 频率分档

| 分档 | 条件 | 间隔 |
|------|------|------|
| 高频 | 近 7 天 ≥ 5 篇 | 每天 1 次 |
| 中频 | 近 7 天 1-4 篇 | 每 7 天 |
| 低频 | 近 14 天 1 篇 | 每 15 天 |
| 休眠 | 近 30 天 0 篇 | 每 30 天 |

> 保守策略：最小间隔 1 天，避免频繁请求。

### 返回示例

```json
{
  "source": "my-source",
  "mode": "schedule_book",
  "analysis": {
    "band": "低频",
    "intervalDays": 15,
    "lastFetch": null,
    "nextFetch": "2026-10-02",
    "recent7dCount": 0,
    "recent14dCount": 1,
    "recent30dCount": 3,
    "totalArticles": 25
  },
  "writeResult": {
    "status": "updated",
    "slug": "crawler-schedule"
  }
}
```

### 前置条件

1. `kv.enabled = true`（依赖 KV 去重数据中的时间戳）
2. 已通过 `yuque_crawl_save` 至少抓取过一些文章
3. `crawler.namespaces.{source}.schedule_slugs` 已配置（分析结果写回时使用）

职责分工：
- **fetch**：工具负责，拿原始 HTML
- **清洗**：Agent 负责，提取正文 + HTML→Markdown
- **save**：工具负责，去重 + 写入语雀

## 清洗规范

Agent 拿到原始 HTML 后，必须按以下规范清洗后再传给 `yuque_crawl_save`：

### 1. 提取正文

根据站点选择合适的 CSS 选择器提取正文区域：

| 站点 | 选择器 |
|------|--------|
| 博客园 | `#cnblogs_post_body` |
| 少数派 | `.article-body` |
| 阮一峰 | `#main-content` |
| IT之家 | `#paragraph` |
| 其他 | Agent 分析 HTML 自行确定 |

### 2. HTML → Markdown 转换规则

```
<script>/<style>/<noscript> → 删除
<pre><code class="language-xxx"> → ```xxx\n...\n```
<pre><code>（无语言标记） → ```\n...\n```
<code>（行内） → `...`
<h1>-<h6> → # ~ ######
<p> → 段落
<br> → 换行
<strong>/<b> → **...**
<em>/<i> → *...*
<a href="url">text</a> → [text](url)
<img src="url" alt="text"> → ![text](url)
<blockquote> → > ...
<li> → - ...
<ul>/<ol> → 保留列表结构
<hr> → ---
其他标签 → 去除标签保留文本
&nbsp; → 空格
&amp; &lt; &gt; &quot; → & < > "
```

### 3. 标题处理

- 从 `<title>` 标签提取标题
- 去掉末尾的 ` - 博客园`、` | 站点名` 等后缀
- 加上站点前缀，如 `[博客园] `

### 4. 格式要求

- 传给 `yuque_crawl_save` 时指定 `format: "markdown"`
- 正文干净，不含导航栏、页脚、侧边栏、广告
- 图片链接保留原始 URL，不下载

## 配置

```json
{
  "crawler": {
    "enabled": true,
    "namespaces": {
      "my-source": {
        "book_id": [0],
        "kv_slugs": [],
        "schedule_slugs": []
      }
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `book_id` | 目标知识库 ID 数组。最后一个为当前活跃仓库，满 5000 篇自动扩容追加 |
| `kv_slugs` | KV 去重分片文档（`{book_id}/{doc_id}` 格式） |
| `schedule_slugs` | 定时策略配置文档（`{book_id}/{doc_id}` 格式） |

### 目标知识库解析优先级

1. `target_repo` 参数（直接指定）
2. `crawler.namespaces.{source}.book_id`（按来源匹配）

## 去重

- 依赖 `kv.enabled = true`
- slug = URL 的 md5 前 12 位
- 通过 KV map 检查是否已存在
- 已存在则跳过，返回 `skipped`

## 限制

- 仅支持静态 HTML 页面，不处理 JS 渲染（SPA）
- CSS 选择器不支持伪类、属性值匹配、兄弟选择器
- 无 JavaScript 执行环境