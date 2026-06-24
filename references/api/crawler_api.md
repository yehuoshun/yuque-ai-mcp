# Crawler API 参考

爬虫域工具，用于网页抓取、内容提取和写入语雀。

## 工具列表

| 工具 | 说明 |
|------|------|
| `yuque_crawl_fetch` | HTTP GET 抓取网页原始 HTML |
| `yuque_crawl_extract` | CSS 选择器从 HTML 提取内容 |
| `yuque_crawl_save` | 去重 + 写入语雀（接收 Agent 清洗后的内容） |

## 使用流程

```
yuque_crawl_fetch → Agent 清洗 → yuque_crawl_save
```

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
      "cnblogs": {
        "book_id": 0,
        "kv_slugs": ["0/0"],
        "schedule_slugs": ["0/0"]
      }
    }
  }
}
```

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