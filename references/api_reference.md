# 语雀 OpenAPI 参考

> 来源：语雀官方 OpenAPI 文档
> 基地址：`https://www.yuque.com/api/v2`

## 认证

所有 API 请求需携带 Token：

```http
X-Auth-Token: {token}
```

## 用户 API

### 获取当前用户

```http
GET /api/v2/user
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户 ID |
| `login` | string | 用户名 |
| `name` | string | 昵称 |
| `avatar_url` | string | 头像 URL |
| `description` | string | 简介 |

## 知识库 API

### 获取知识库列表

```http
GET /api/v2/users/{login}/repos
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `name` | string | 名称 |
| `slug` | string | slug |
| `description` | string | 描述 |
| `public` | int | 0=私有 / 1=公开 / 2=团队内公开 |
| `items_count` | int | 文档数量 |

### 获取知识库详情

```http
GET /api/v2/repos/{id_or_namespace}
```

> `{id_or_namespace}` 支持 book_id（数字）或 namespace（如 `group/book_slug`）。

### 创建知识库

```http
POST /api/v2/users/{login}/repos
Content-Type: application/json

{
  "name": "名称",
  "slug": "repo-slug",
  "description": "描述",
  "public": 0
}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `name` | 名称（必填） | - |
| `slug` | 路径（必填） | - |
| `description` | 简介 | - |
| `public` | 0=私有 / 1=公开 / 2=团队内公开 | 0 |

⚠️ **slug 必填**：语雀不再自动生成 slug。生成规则：`{拼音缩写}-{时间戳}`，如 `javamst-1714473600`，避免重复。

**slug 格式约束**：仅支持 `[a-z0-9._-]`，大写自动转小写，禁止空格。

### 更新知识库

```http
PUT /api/v2/repos/{id_or_namespace}
Content-Type: application/json

{
  "name": "新名称",
  "description": "新描述",
  "public": 1,
  "toc": "- [文档名](slug)\n  - [子文档](child-slug)"
}
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `name` | 名称 |
| `slug` | 路径 |
| `description` | 简介 |
| `public` | 0=私有 / 1=公开 / 2=团队内公开 |
| `toc` | 目录（Markdown 格式，全量替换）。格式：`[标题](文档slug)`，缩进空格表示层级 |

> 📌 `toc` 用于批量更新目录树，比逐个调目录 API 更高效。

### 删除知识库

> ⚠️ **硬删除**：不可逆，删除知识库会删除其下所有文档。

```http
DELETE /api/v2/repos/{id_or_namespace}
```



## 文档 API

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

> ⚠️ 搜索只能用 `/api/v2/search`，`list_docs` 端点无搜索参数。

```http
GET /api/v2/search?q={query}&type={type}&scope={scope}&page={page}
```

**PageSize 固定为 20**，不支持自定义分页大小。

**参数**：

| 参数 | 说明 | 约束 |
|------|------|------|
| `q` | 搜索关键词（必填） | ≤ 200 字符 |
| `type` | `doc`（文档）/ `repo`（知识库）| 必填 |
| `scope` | 搜索范围，不填默认搜索当前用户/团队 | ≤ 400 字符 |
| `page` | 页码 | 1-100 |
| `creator` | 仅搜索指定作者 login（可选） | - |
| `offset` | ⚠️ 已废弃，同 `page`，勿用 | - |

**scope 说明**：
- 不填：搜索当前用户/团队全部
- 搜索团队全部文档：`scope={group}`（如 `yehuoshun`）
- 搜索指定知识库文档：`scope={group}/{book_slug}`（如 `yehuoshun/gi49zs`）
- 只支持 namespace 格式，**不支持 book_id**

**返回结构**：

```json
{
  "meta": {
    "total": 32,
    "pageNo": 1,
    "pageSize": 20
  },
  "data": [
    {
      "id": 123456,
      "type": "doc",
      "title": "文档标题",
      "summary": "摘要（含高亮标记 <em>关键词</em>）",
      "url": "/yehuoshun/xxx/slug",
      "target": {
        "id": 123456,
        "type": "Doc",
        "slug": "abc123",
        "title": "文档标题",
        "book_id": 789,
        "book": {
          "id": 789,
          "name": "知识库名称",
          "namespace": "yehuoshun/xxx"
        }
      },
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**分页**：
- 总数：`.meta.total`
- 当前页：`.meta.pageNo`
- 每页条数：`.meta.pageSize`
- 结果列表：`.data[]`

**返回字段说明**：

| 字段 | 说明 |
|------|------|
| `.meta.total` | 搜索结果总数 |
| `.meta.pageNo` | 当前页码 |
| `.meta.pageSize` | 每页条数 |
| `.data[].id` | 搜索结果 ID |
| `.data[].type` | 类型：`doc`（文档）/ `repo`（知识库）|
| `.data[].title` | 文档标题 |
| `.data[].summary` | 摘要（含高亮标记 `<em>`） |
| `.data[].url` | 文档相对路径 |
| `.data[].info` | 归属信息 |
| `.data[].target.book_id` | 知识库 ID |
| `.data[].target.book.namespace` | 知识库 namespace |
| `.data[].target.id` | 文档 ID |
| `.data[].target.slug` | 文档 slug |

## 小记 API

### 获取小记列表

```http
GET /api/v2/notes?page={page}&limit={limit}&status={status}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `page` | 页码 | 1 |
| `limit` | 每页条数 | 20 |
| `status` | 0=正常 / 9=已删除 | 0（不传也默认正常） |

**返回结构**（`.data` 内）：

```json
{
  "pin_notes": [  /* 置顶小记列表 */ ],
  "notes": [     /* 普通小记列表 */ ],
  "has_more": true
}
```

**小记对象字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 小记 ID |
| `slug` | string | 小记 slug |
| `content` | object | 内容对象，详见下方 |
| `word_count` | int | 字数 |
| `tags` | array | 标签列表 |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `pinned_at` | string/null | 置顶时间（null 表示未置顶） |
| `status` | int | 0=正常 / 9=已删除 |
| `likes_count` | int | 点赞数 |
| `comments_count` | int | 评论数 |

⚠️ **列表 vs 详情的 content 差异**：
- **列表 API**：`content` 只有 `abstract` 和 `updated_at`，**没有 `source` 和 `html`**
- **详情 API**（`GET /notes/{id}`）：`content` 包含完整字段 `{source, html, abstract, format, draft_version, doc_dynamic_data}`

### 获取小记详情

```http
GET /api/v2/notes/{note_id}
```

**返回字段**：同上小记对象。

⚠️ **重要**：`content` 是嵌套对象，结构为：
```json
{
  "content": {
    "source": "纯文本内容",
    "html": "<p>HTML 内容</p>",
    "abstract": "摘要文本（前 200 字左右）",
    "format": "markdown",
    "draft_version": 0,
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

读取小记内容时用 `note.content.source` / `note.content.html` / `note.content.abstract`，不是 `note.content` 直接当字符串。

### 创建小记

```http
POST /api/v2/notes
Content-Type: application/json

{
  "body": "小记内容"
}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `body` | 小记正文内容（必填） |

**返回字段**（`.data` 内）：
| 字段 | 说明 |
|------|------|
| `note_url` | 小记链接 |

⚠️ **实测**：创建小记接口**只返回 `note_url`**，不返回 `id` 和 `slug`。如需获取 id，创建后查小记列表通过 `note_url` 中的 slug 匹配。

### 更新小记

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "新正文（纯文本）",
  "html": "<p>新正文</p>",
  "abstract": "前200字摘要"
}
```

**参数说明**：
| 参数 | 说明 |
|------|------|
| `source` | 纯文本内容（非 Lake 格式也可） |
| `html` | HTML 内容，用 `<p>文本</p>` 包裹 |
| `abstract` | 摘要，取前 200 字 |
| `status` | 可选，9=删除 / 0=恢复 |

**注意**：
- `source` 和 `html` 均非必传 Lake 格式，纯文本包裹 `<p>` 即可正常工作（参考官方 yuque-mcp-server）
- 三个字段不可省略
- 更新后返回完整小记对象（路径 `.data.data`）

### 删除小记

> 💡 **软删除**：小记删除是软删除，移入回收站（status=9），可通过恢复操作还原。

**方法**：先获取小记内容，再 PUT 更新并设置 `status: 9`

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "原文内容",
  "html": "原文HTML",
  "abstract": "原文摘要",
  "status": 9
}
```

**注意**：
- 必须先获取小记原文（包含 source、html、abstract），再软删除
- 删除后进入回收站，可通过设置 `status: 0` 恢复

### 恢复小记

**方法**：先获取小记内容，再 PUT 更新并设置 `status: 0`

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "原文内容",
  "html": "原文HTML",
  "abstract": "原文摘要",
  "status": 0
}
```

将 status 从 9（已删除）改回 0（正常）即可恢复。

## 文档版本 API

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

## 连通性测试 API

### Hello

```http
GET /api/v2/hello
```

**用途**：测试 API Token 是否有效，可用于验证连通性。

**返回示例**：

```json
{
  "data": {
    "message": "Hello, {user_name}!"
  }
}
```

## 目录 API

### 获取目录

```http
GET /api/v2/repos/{book_id}/toc
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `uuid` | string | 节点唯一 ID |
| `type` | string | `DOC`（文档）/ `TITLE`（分组）/ `LINK`（外链） |
| `title` | string | 节点名称 |
| `url` | string | 节点 URL（LINK 类型） |
| `doc_id` | int | 文档 ID（仅 DOC 类型） |
| `level` | int | 节点层级（0=根级，1=一级子节点，2=二级子节点，以此类推） |
| `parent_uuid` | string | 父节点 UUID（根级为 null） |
| `child_uuid` | string | 子级第一个节点 UUID（无子节点为 null） |
| `prev_uuid` | string | 同级前一个节点 UUID |
| `sibling_uuid` | string | 同级后一个节点 UUID |
| `visible` | int | 是否可见（0=隐藏 / 1=可见） |

### 更新目录

```http
PUT /api/v2/repos/{book_id}/toc
Content-Type: application/json

{
  "action": "appendNode",
  "action_mode": "child",
  "type": "DOC",
  "doc_ids": [文档ID],
  "target_uuid": "目录UUID"
}
```

> **⚠️ 字段语义区分**：
> - `target_uuid` — 目标位置（appendNode/prependNode 时指定插入到哪个节点旁边，创建 TITLE 必填否则静默忽略）
> - `node_uuid` — 操作对象（editNode/removeNode 时指定要编辑/删除的节点 UUID，移动时表示要移动的节点）
> - 创建 DOC 用 `doc_ids`，创建 TITLE 用 `title` + `type:TITLE`

**action 说明**：

| 值 | 说明 |
|---|------|
| `appendNode` | 尾插（创建节点、接受 `target_uuid`） |
| `prependNode` | 头插（创建/移动节点，接受 `target_uuid` + `node_uuid`） |
| `editNode` | 编辑节点（改名等，需 `node_uuid`） |
| `removeNode` | 删除节点（不删除关联文档，需 `node_uuid` + `action_mode`） |

**action_mode 说明**：

| 值 | 说明 |
|---|------|
| `sibling` | 与 target_uuid 同级 |
| `child` | 作为 target_uuid 的子节点 |

**常用操作速查**：

| 操作 | action | action_mode | 关键字段 |
|------|--------|-------------|---------|
| 创建根级 TITLE | appendNode | sibling | type:TITLE + title + target_uuid |
| 创建子级 TITLE | appendNode | child | type:TITLE + title + target_uuid |
| 文档挂分组 | removeNode → appendNode | sibling → child | node_uuid → doc_ids + target_uuid |
| 删除节点 | removeNode | sibling | node_uuid |
| 重命名节点 | editNode | sibling | node_uuid + title + type |

**请求体字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | ✅ | `appendNode`（尾插）/ `prependNode`（头插）/ `editNode`（编辑）/ `removeNode`（删除） |
| `action_mode` | string | ✅ | `sibling`（同级）/ `child`（子级）。prependNode 创建时不支持 sibling |
| `target_uuid` | string | 创建 TITLE 时必填 | 目标节点 UUID，指定插入位置。不填默认根节点（但实际创建 TITLE 时不填会静默忽略） |
| `node_uuid` | string | 移动/更新/删除必填 | 操作节点 UUID，指向要移动/编辑/删除的已有 TOC 节点 |
| `doc_ids` | int[] | 创建 DOC 必填 | 文档 ID 数组 |
| `type` | string | 创建必填 | `DOC`（文档）/ `TITLE`（分组）/ `LINK`（外链） |
| `title` | string | 创建/编辑 TITLE 必填 | 节点名称 |
| `url` | string | 创建外链必填 | 外链 URL |
| `open_window` | int | 外链选填 | 0=当前页打开 / 1=新窗口打开 |
| `visible` | int | 选填 | 0=不可见 / 1=可见（默认 1） |

**首插（文档放目录第一位）**：

> `prependNode` 不支持直接用 `doc_ids` 创建（返回 400），只能配合 `node_uuid` 移动已有节点。

首插需两步：
1. **创建文档** → `yuque_create_doc` 自动 `appendNode` 挂载到 TOC 末尾
2. **移动到位** → `prependNode` + `sibling` + `node_uuid`（文档的 TOC UUID）+ `target_uuid`（当前首位节点的 UUID）

```json
// 步骤1：yuque_create_doc 已完成，文档在 TOC 末尾

// 步骤2：从 list_toc 取文档 TOC UUID 和首位 UUID，调用：
{
  "action": "prependNode",
  "action_mode": "sibling",
  "node_uuid": "<文档的TOC_UUID>",
  "target_uuid": "<第一位节点的UUID>"
}
```

**注意**：
- `appendNode` 不接受 `node_uuid`（会返回 `invalid action`），移动已有节点到子级请用 `prependNode` + `child` + `node_uuid` + `target_uuid`
- DOC 已在 TOC 中时不能直接 `appendNode child`，必须先 `removeNode` 再 `appendNode child`
- 删除 TITLE 分组时 `action_mode=sibling` 仅删分组，`action_mode=child` 会尝试级联删子节点

## 文档导出

### 单篇导出

```http
GET /api/v2/repos/{book_id}/docs/{doc_id}?raw=1
```

获取文档 Markdown 原文后保存为 `{标题}.md`。

```python
# 示例
body = api.get_doc_body(book_id, doc_id)
with open(f"{title}.md", "w", encoding="utf-8") as f:
    f.write(body)
```

### 批量导出

完整流程：

1. **获取目录树**：`GET /repos/{book_id}/toc`
2. **递归展开所有文档节点**：遍历 `children`，收集所有 `type=DOC` 的 `doc_id`
3. **并发下载**：`ThreadPoolExecutor(max_workers=3)` 并发调 `GET /repos/{book_id}/docs/{doc_id}?raw=1`
4. **根据 TOC 创建目录结构**：`os.makedirs()` 按层级创建文件夹
5. **下载文档中引用的图片**：正则提取 `![](...)`，下载到本地并替换路径
6. **交叉引用替换**：`[文档名](slug)` 内部链接替换为 `.md` 相对路径

### 增量导出

1. 记录上次导出时间戳 `last_export`
2. `list_all_docs(book_id)` 获取全部文档，筛选 `updated_at > last_export`
3. 仅导出变更文档，覆盖本地对应文件
4. 更新 `last_export` 时间戳

## 群组成员 API

> ⚠️ **未测试**：此模块 API 需要团队/群组环境，当前未实际测试，可能存在问题。如有问题请反馈。

### 列出群组成员

```http
GET /api/v2/groups/{login}/users?offset={offset}&role={role}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `role` | 筛选角色：0=管理员 / 1=成员 / 2=只读（可选） |
| `offset` | 分页偏移，PageSize 固定 100（可选，默认 0） |

**返回 JSON**：`data` 为 `V2GroupUser` 数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 成员记录 ID |
| `group_id` | int | 团队 ID |
| `user_id` | int | 成员用户 ID |
| `role` | int | 角色：0=管理员 / 1=成员 / 2=只读 |
| `user` | object | 用户信息（id/login/name/avatar_url） |
| `group` | object | 团队信息（id/login/name/avatar_url） |
| `created_at` | string | 加入时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |

### 变更成员角色

```http
PUT /api/v2/groups/{login}/users/{id}
Content-Type: application/json

{
  "role": 1
}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `id` | 用户 Login 或 ID（必填） |
| `role` | 0=管理员 / 1=成员（默认） / 2=只读 |

⚠️ 只有群组管理员可以修改成员角色。

**返回 JSON**：`data` 为完整 `V2GroupUser` 对象（含 id/group_id/user_id/role/user/group/created_at/updated_at）。

### 移除群组成员

> ⚠️ **硬删除**：不可逆。

```http
DELETE /api/v2/groups/{login}/users/{id}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `id` | 用户 Login 或 ID（必填） |

**返回 JSON**：`{ "data": { "user_id": "string" } }`

## 统计 API

> ⚠️ 需要 `statistic:read` 权限，请在语雀设置中生成带该权限的 Token。

### 团队整体统计

```http
GET /api/v2/groups/{login}/statistics
```

**返回 JSON**：`data` 为 `V2GroupStatistics` 对象（含 member_count/collaborator_count/read_count/write_count/doc_count/book_count/grains_count 等全部统计字段，均为 string 类型）。

### 团队成员统计

```http
GET /api/v2/groups/{login}/statistics/members?name={name}&range={range}&page={page}&limit={limit}&sortField={sortField}&sortOrder={sortOrder}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `name` | 成员名筛选（可选） |
| `range` | 0=全部 / 30=30天 / 365=一年（可选，默认 0） |
| `page` | 页码（默认 1） |
| `limit` | 分页数量，上限 20（默认 10） |
| `sortField` | write_doc_count / write_count / read_count / like_count |
| `sortOrder` | desc / asc（默认 desc） |

**返回 JSON**：`data.members` 为 `V2MemberStatistics` 数组，`data.total` 为总数。

### 团队知识库统计

```http
GET /api/v2/groups/{login}/statistics/books?name={name}&range={range}&page={page}&limit={limit}&sortField={sortField}&sortOrder={sortOrder}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `name` | 知识库名筛选（可选） |
| `range` | 0=全部 / 30=30天 / 365=一年（可选，默认 0） |
| `page` | 页码（默认 1） |
| `limit` | 分页数量，上限 20（默认 10） |
| `sortField` | content_updated_at_ms / word_count / post_count / read_count / like_count / watch_count / comment_count |
| `sortOrder` | desc / asc（默认 desc） |

**返回 JSON**：`data.books` 为 `V2BookStatistics` 数组，`data.total` 为总数。

### 团队文档统计

```http
GET /api/v2/groups/{login}/statistics/docs?bookId={bookId}&name={name}&range={range}&page={page}&limit={limit}&sortField={sortField}&sortOrder={sortOrder}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `bookId` | 指定知识库 ID（可选） |
| `name` | 文档名筛选（可选） |
| `range` | 0=全部 / 30=30天 / 365=一年（可选，默认 0） |
| `page` | 页码（默认 1） |
| `limit` | 分页数量，上限 20（默认 10） |
| `sortField` | content_updated_at / word_count / read_count / like_count / comment_count / created_at |
| `sortOrder` | desc / asc（默认 desc） |

**返回 JSON**：`data.docs` 为 `V2DocStatistics` 数组，`data.total` 为总数。

## API 限制

| 限制项 | 上限 |
|--------|------|
| 单知识库文档数 | 5000 |
| API QPS | 100/s |
| API 每小时请求 | 5000/h |
| 文档标题字数 | 200 |

## 错误处理

### 错误响应格式

```json
{
  "status": 401,
  "message": "Unauthorized",
  "errors": [
    {
      "code": "invalid_token",
      "message": "Token is invalid or expired"
    }
  ]
}
```

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求参数错误 | 输出错误信息，检查参数格式 |
| 401 | Token 无效或已过期 | 重新生成 Token 后更新配置 |
| 403 | 权限不足 | 说明缺少的权限，检查 Token 权限范围 |
| 404 | 资源不存在 | 文档/知识库/小记可能已被删除或 ID 错误 |
| 410 | 资源已删除 | 资源已被删除或 API 端点已废弃 |
| 429 | 请求过于频繁 | 检查 `X-RateLimit-Remaining`：`=0` 触及 5000/h → 立即暂停，保存进度，通知用户整点后重新触发；`>0` 触及 100/s → 等待 1s 重试（最多 3 次） |
| 500 | 语雀服务器内部错误 | 稍后重试 |
| 502/503/504 | 网关错误 | 稍后重试 |

## 速率限制

### 响应头

每次 API 调用都会返回以下响应头：

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 总次数限制（每小时） |
| `X-RateLimit-Remaining` | 剩余可用次数 |

**使用方式**：每次请求后检查 `X-RateLimit-Remaining`，合理控制请求节奏。
