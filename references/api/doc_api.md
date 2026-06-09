# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 获取文档列表

```http
GET /api/v2/repos/{book_id}/docs?offset={offset}&limit={limit}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `offset` | 偏移量（分页） | 0 |
| `limit` | 每页条数（≤100） | 100 |
| `optional_properties` | 额外字段，逗号分隔。支持：`hits`（阅读数）、`tags`（标签）、`latest_version_id`（最新已发版本 ID） | "" |

> ⚠️ `limit` 超过 100 时 `optional_properties` 会失效。分页获取全部文档时建议用 `offset` 递增，或直接用 TOC API 获取完整目录树。

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档 ID |
| `title` | string | 标题 |
| `slug` | string | 文档 slug |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `word_count` | int | 字数 |

### 获取文档详情

```http
# 获取完整 JSON（推荐）
GET /api/v2/repos/{book_id}/docs/{doc_id}

# 或获取纯文本（仅 markdown 格式文档有效）
GET /api/v2/repos/{book_id}/docs/{doc_id}?raw=1
```

**参数**：

| 参数 | 说明 |
|------|------|
| `raw` | `1` = 返回文档原文。**仅限 markdown 格式文档**返回纯 Markdown。不传时返回完整 JSON（含 `body`/`body_html`/`body_lake`/`format`）。lake/html 格式文档应不传 raw，按 format 选择对应字段读取 |

**支持格式**：
- `markdown`：标准 Markdown
- `lake`：语雀原生 JSON 格式，`body` / `body_lake` 返回 Lake JSON。支持 Mermaid 图表等增强语法
- `html`：HTML 标准格式
- `lakesheet`：语雀表格

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档 ID |
| `type` | string | 文档类型：`Doc`(普通文档) / `Sheet`(表格) / `Thread`(话题) / `Board`(图集) / `Table`(数据表) |
| `book_id` | int | 所属知识库 ID |
| `title` | string | 标题 |
| `slug` | string | 文档路径 |
| `description` | string | 摘要 |
| `cover` | string | 封面 |
| `format` | string | 内容格式：`markdown` / `lake` / `html` / `lakesheet` |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `status` | int | 0=草稿 / 1=发布 |
| `body` | string | 正文（markdown/Lake 源码） |
| `body_draft` | string | 草稿内容 |
| `body_html` | string | HTML 内容 |
| `body_lake` | string | Lake 格式内容 |
| `body_sheet` | string | 表格正文（Sheet 类型），JSON 二维数组 `{version, data: [{name, rowCount, colCount, table: [[...]]}]}` |
| `body_table` | string | 数据表正文（Table 类型），JSON `{totalCount, records, pageSize, page}` |
| `word_count` | int | 字数 |
| `read_count` | int | 阅读数 |
| `likes_count` | int | 点赞数 |
| `comments_count` | int | 评论数 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 最后操作时间 (ISO 8601) |
| `content_updated_at` | string | 内容最后修改时间 (ISO 8601) |
| `published_at` | string | 发布时间 (ISO 8601) |
| `latest_version_id` | int | 最新已发版本 ID |
| `creator` | object | 创建者信息 |
| `user` | object | 最后操作者信息 |
| `book` | object | 所属知识库（含 id/name/namespace） |
| `tags` | array | 标签列表 |

### 创建文档

```http
POST /api/v2/repos/{book_id}/docs
Content-Type: application/json

{
  "title": "标题",
  "format": "markdown",
  "body": "内容",
  "public": 0
}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `title` | 标题（必填） | - |
| `format` | 格式：`markdown` / `html` / `lake` | `markdown` |
| `body` | 正文内容（必填） | - |
| `public` | 0=私密 / 1=公开 / 2=企业内公开（不填继承知识库） | 继承 |
| `slug` | 文档路径（可选） | 自动生成 |

> 📤 **返回**：完整文档对象，字段同 [获取文档详情](#获取文档详情) 返回结构（含 id/type/slug/body 等全部字段）。

⚠️ **重要**：创建文档后**必须添加到目录**，否则文档不会显示在知识库目录中。使用目录 API：
```http
PUT /api/v2/repos/{book_id}/toc
Content-Type: application/json

{
  "action": "appendNode",
  "action_mode": "sibling",
  "type": "DOC",
  "doc_ids": [新建文档ID]
}
```

> 💡 如需**首插**（文档放在目录第一位）：`prependNode` 不支持直接用 `doc_ids` 创建，需两步：① 创建文档（自动 appendNode 挂到 TOC 末尾）→ ② `prependNode` + `node_uuid` 移到首位。详见 [目录 API · 首插](#目录-api) 示例。

### 更新文档

```http
PUT /api/v2/repos/{book_id}/docs/{doc_id}
Content-Type: application/json

{
  "title": "新标题",
  "body": "新内容",
  "slug": "新路径",
  "format": "markdown",
  "public": 0
}
```

**参数**（全部可选，只传需更新的字段）：

| 参数 | 说明 |
|------|------|
| `title` | 标题 |
| `body` | 正文内容 |
| `slug` | 文档路径 |
| `format` | 内容格式：`markdown` / `html` / `lake` |
| `public` | 0=私密 / 1=公开 / 2=企业内公开 |

> 📤 **返回**：完整文档对象，字段同 [获取文档详情](#获取文档详情)。

### 删除文档

> ⚠️ **硬删除**：不可逆。

```http
DELETE /api/v2/repos/{book_id}/docs/{doc_id}
```



## 搜索 API

### 获取文档版本列表

```http
GET /api/v2/doc_versions?doc_id={doc_id}
```

**参数**：

| 参数 | 说明 |
|------|------|
| `doc_id` | 文档 ID（必填） |

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 版本 ID |
| `doc_id` | int | 关联文档 ID |
| `title` | string | 版本标题 |
| `body` | string | 版本正文内容 |
| `body_draft` | string | 草稿内容 |
| `format` | string | 格式（markdown/lake） |
| `user_id` | int | 编辑者 ID |
| `user` | object | 编辑者信息（name, avatar_url 等） |
| `created_at` | string | 版本创建时间 |

### 获取文档版本详情

```http
GET /api/v2/doc_versions/{version_id}
```

**返回字段**：与版本列表中的单个版本对象结构相同。

