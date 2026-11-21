# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

> 本文覆盖三个工具：`yuque_search`（API v2 `GET /search`）、`yuque_web_search`（Cookie 态 `GET /api/zsearch`）、`yuque_rag_search`（多关键词并发 + 取正文，见文末）。
> 文中两处「返回结构」写的是**语雀 HTTP 响应**；MCP 工具输出会再裁剪一层（见各节「MCP 工具输出」）。

## 通用搜索

```http
GET /api/v2/search?q={q}&type={type}&scope={scope}&page={page}
```

> ⚠️ `list_docs` 端点无搜索参数，搜索只能用此接口。
> ⚠️ **符号匹配极差**：对 `[]`、`-`、`_` 等符号分词能力很弱，标题避免符号前缀。
> ⚠️ **分词限制**：搜索仅支持中文、英文或中英混合关键词，受语雀分词策略影响。纯数字、特殊符号、单字母等可能无法命中。

**PageSize 固定为 20**。

### 参数

| 参数 | 位置 | 类型 | 说明 | 约束 |
|------|------|------|------|------|
| `q` | query | string | 搜索关键词（必填） | ≤ 200 字符 |
| `type` | query | string | 搜索类型（必填） | `doc` / `repo` |
| `scope` | query | string | 搜索范围 | ≤ 400 字符 |
| `page` | query | int | 页码 | 1-100 |
| `creator` | query | string | 仅搜索指定作者 login（筛选） | - |
| `creatorId` | query | int | Deprecated，仅搜索指定作者 ID | - |
| `offset` | query | int | Deprecated，同 `page`，勿用 | 1-100 |

### scope 说明

不填默认搜索当前用户/团队全部。

| 场景 | scope 值 |
|------|---------|
| 搜索团队里文档 | `scope={group}`，如 `yehuoshun` |
| 搜索团队里知识库 | `type=repo&scope={group}` |
| 搜索知识库里文档 | `scope={group}/{book_slug}`，如 `yehuoshun/gi49zs` |

> 只支持 namespace 格式，**不支持 book_id**。

### 返回结构

```json
{
  "meta": {
    "total": 0,
    "pageNo": 0,
    "pageSize": 20
  },
  "data": [
    {
      "id": 0,
      "type": "doc",
      "title": "string <em>高亮</em>",
      "summary": "string <em>高亮</em>",
      "url": "string",
      "info": "string",
      "target": {
        "id": 0,
        "type": "Doc",
        "slug": "string",
        "title": "string",
        "description": "string",
        "cover": "string",
        "user_id": 0,
        "book_id": 0,
        "last_editor_id": 0,
        "public": 0,
        "status": "string",
        "likes_count": 0,
        "read_count": 0,
        "hits": 0,
        "comments_count": 0,
        "word_count": 0,
        "created_at": "2019-08-24T14:15:22Z",
        "updated_at": "2019-08-24T14:15:22Z",
        "content_updated_at": "2019-08-24T14:15:22Z",
        "published_at": "2019-08-24T14:15:22Z",
        "first_published_at": "2019-08-24T14:15:22Z",
        "book": {
          "id": 0,
          "type": "string",
          "slug": "string",
          "name": "string",
          "user_id": 0,
          "description": "string",
          "creator_id": 0,
          "public": 0,
          "items_count": 0,
          "likes_count": 0,
          "watches_count": 0,
          "content_updated_at": "2019-08-24T14:15:22Z",
          "created_at": "2019-08-24T14:15:22Z",
          "updated_at": "2019-08-24T14:15:22Z",
          "user": {},
          "namespace": "string"
        },
        "user": {},
        "last_editor": {},
        "latest_version_id": 0,
        "tags": {}
      }
    }
  ]
}
```

### 返回字段

#### meta

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | int | 结果总量 |
| `pageNo` | int | 页码 |
| `pageSize` | int | 每页数量（固定 20） |

#### data[]

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 搜索结果 ID |
| `type` | string | `doc` / `repo` |
| `title` | string | 标题（含 `<em>` 高亮） |
| `summary` | string | 摘要（含 `<em>` 高亮） |
| `url` | string | 访问路径 |
| `info` | string | 归属信息 |
| `target` | object | type=doc 时为 V2Doc；type=repo 时为 V2Book |

#### target 为 V2Doc 时（type=doc）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档 ID |
| `type` | string | Doc / Sheet / Thread / Board / Table |
| `slug` | string | 路径 |
| `title` | string | 标题 |
| `description` | string | 摘要 |
| `cover` | string | 封面 |
| `user_id` | int | 归属用户/团队 ID |
| `book_id` | int | 归属知识库 ID |
| `last_editor_id` | int | 最后编辑者 ID |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `status` | string | 0=草稿 / 1=发布 |
| `likes_count` | int | 点赞数 |
| `read_count` | int | 阅读数（需 optional_properties=hits） |
| `hits` | int | Deprecated，阅读数 |
| `comments_count` | int | 评论数 |
| `word_count` | int | 内容字数 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `content_updated_at` | string | 内容更新时间 (ISO 8601) |
| `published_at` | string | 发布时间 (ISO 8601) |
| `first_published_at` | string | 首次发布时间 (ISO 8601) |
| `book` | object | V2Book，所属知识库 |
| `user` | object | V2User，创建者 |
| `last_editor` | object | V2User，最后编辑者 |
| `latest_version_id` | int | 最新已发版本 ID（需 optional_properties=latest_version_id） |
| `tags` | object | V2Tag，标签信息 |

#### target.book (V2Book)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `type` | string | Book / Design / Sheet / Resource |
| `slug` | string | 路径 |
| `name` | string | 名称 |
| `user_id` | int | 归属用户/团队 ID |
| `description` | string | 简介 |
| `creator_id` | int | 创建者 ID |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `items_count` | int | 文档数量 |
| `likes_count` | int | 点赞数量 |
| `watches_count` | int | 订阅数量 |
| `content_updated_at` | string | 知识库 META 更新时间 (ISO 8601) |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `user` | object | V2User，创建者 |
| `namespace` | string | 完整路径 |

#### target.user / target.last_editor / target.book.user (V2User)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户 ID |
| `type` | string | Deprecated，始终为 `User` |
| `login` | string | 登录名 |
| `name` | string | 昵称 |
| `avatar_url` | string | 头像 |
| `books_count` | int | 知识库数量 |
| `public_books_count` | int | 公开知识库数量 |
| `followers_count` | int | 被关注人数 |
| `following_count` | int | 关注的人数 |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `description` | string | 介绍 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |

#### target.tags (V2Tag)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | TAG ID |
| `title` | string | TAG NAME |
| `doc_id` | int | 文档 ID |
| `book_id` | int | 知识库 ID |
| `user_id` | int | 创建者 ID |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |

#### target 为 V2Book 时（type=repo）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `type` | string | Book / Design / Sheet / Resource |
| `slug` | string | 路径 |
| `name` | string | 名称 |
| `user_id` | int | 归属用户/团队 ID |
| `description` | string | 简介 |
| `creator_id` | int | 创建者 ID |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `items_count` | int | 文档数量 |
| `likes_count` | int | 点赞数量 |
| `watches_count` | int | 订阅数量 |
| `content_updated_at` | string | 知识库 META 更新时间 (ISO 8601) |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `user` | object | V2User，创建者 |
| `namespace` | string | 完整路径 |
---

## Cookie 态 Web 搜索

```http
GET /api/zsearch?q={q}&type={type}&scope={scope}&p={p}&sence=searchPage
```

> ⚠️ **Cookie 认证**：需要 `cookie` + `ctoken` 配置，与 mine/recycle/upload 域相同。
> ⚠️ **QPS 未知**：Cookie 态接口限流策略不透明，保守单次请求，不要并发。
> ⚠️ **scope 需 URL 编码**：`/` → `%2F`，`/group/book` → `%2Fgroup%2Fbook`。

### 参数

| 参数 | 位置 | 类型 | 说明 | 约束 |
|------|------|------|------|------|
| `q` | query | string | 搜索关键词（必填） | - |
| `type` | query | string | 搜索类型 | `content`（文档）/ `book`（知识库）/ `user`（用户），默认 `content` |
| `scope` | query | string | 搜索范围 | `/` 全局，`/group_slug` 团队，`/group_slug/book_slug` 知识库 |
| `p` | query | int | 页码 | 1-based，默认 1，上限 100（工具层校验） |
| `sence` | query | string | 固定值 | `searchPage` |

### 返回结构

```json
{
  "data": {
    "type": "content",
    "totalHits": 5000,
    "numHits": 20,
    "errorHits": 0,
    "message": "",
    "info": "",
    "hits": [
      {
        "id": 0,
        "title": "string",
        "abstract": "<em>高亮</em>",
        "type": "Doc",
        "url": "/user/book_slug/doc_slug",
        "book_name": "知识库名",
        "group_name": "团队名",
        "slug": "doc_slug",
        "privacy": 0,
        "_record": {
          "id": 0,
          "slug": "doc_slug",
          "title": "string",
          "format": "markdown",
          "word_count": 0,
          "book_id": 0,
          "user_id": 0,
          "description": "",
          "created_at": "2024-01-01T00:00:00.000Z",
          "updated_at": "2024-01-01T00:00:00.000Z",
          "content_updated_at": "2024-01-01T00:00:00.000Z",
          "status": 1,
          "public": 0,
          "comments_count": 0,
          "likes_count": 0,
          "read_count": 0
        }
      }
    ]
  }
}
```

### 返回字段

#### data

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 搜索类型 |
| `totalHits` | int | 精确结果总数 |
| `numHits` | int | 当前页命中数 |
| `errorHits` | int | 错误命中数 |
| `hits` | array | 搜索结果列表 |

#### hits[]

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档/知识库/用户 ID |
| `title` | string | 标题 |
| `abstract` | string | 高亮摘要（含 `<em>` 标签） |
| `type` | string | Doc / Book / User |
| `url` | string | 访问路径 |
| `book_name` | string | 所属知识库名 |
| `group_name` | string | 所属团队名 |
| `slug` | string | 文档 slug |
| `privacy` | int | 隐私级别 |
| `_record` | object | 上游完整对象；**MCP 工具里键名是 `doc`**，见下节 |

#### _record（type=Doc 时）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档 ID |
| `slug` | string | 文档路径 |
| `title` | string | 标题 |
| `format` | string | 格式（markdown/lake/doc） |
| `word_count` | int | 字数 |
| `book_id` | int | 所属知识库 ID |
| `user_id` | int | 创建者 ID |
| `description` | string | 描述 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `content_updated_at` | string | 内容更新时间 (ISO 8601) |
| `status` | int | 0=草稿 / 1=发布 |
| `public` | int | 0=私密 / 1=公开 |
| `comments_count` | int | 评论数 |
| `likes_count` | int | 点赞数 |
| `read_count` | int | 阅读数 |

### MCP 工具输出（`yuque_web_search`）

工具不原样回传上游 JSON，而是 `{ meta, data }`（`server/src/search/web-search.ts` 的 `formatWebSearchResult`）：

```json
{
  "meta": { "total": 5000, "num_hits": 20, "page": 1, "type": "content", "scope": "/", "q": "关键词" },
  "data": [
    {
      "id": 0,
      "title": "string",
      "abstract": "去掉 <em> 的高亮摘要",
      "abstract_html": "<em>高亮</em>摘要",
      "type": "Doc",
      "url": "/user/book_slug/doc_slug",
      "book_name": "知识库名",
      "group_name": "团队名",
      "slug": "doc_slug",
      "privacy": 0,
      "doc": {
        "id": 0, "slug": "doc_slug", "title": "string", "format": "markdown", "word_count": 0,
        "book_id": 0, "user_id": 0, "description": "", "created_at": "…", "updated_at": "…",
        "content_updated_at": "…", "status": 1, "public": 0,
        "comments_count": 0, "likes_count": 0, "read_count": 0
      }
    }
  ]
}
```

与上游的差异：

| 上游 | 工具输出 | 说明 |
|------|----------|------|
| `data.totalHits` | `meta.total` | 精确总命中数 |
| `data.numHits` | `meta.num_hits` | 当前页命中数 |
| `data.hits[].abstract` | `abstract` + `abstract_html` | `abstract` 已去 `<em>`；`abstract_html` 保留原标签 |
| `data.hits[]._record` | `doc` | **键名是 `doc`，不是 `_record`**，且只保留 16 个字段；要完整对象请用 `yuque_get_doc` 或 `raw=true` |
| `data.errorHits` / `message` / `info` | 不输出 | 仅上游内部诊断用 |

### 与 API v2 搜索对比

| | API v2 `GET /search` | Cookie `GET /api/zsearch` |
|---|---|---|
| 认证 | Token | Cookie + ctoken |
| 返回文档 | 摘要（需二次 get_doc） | 完整 `_record` |
| 总数 | ❌ | ✅ `totalHits` |
| 高亮摘要 | ⚠️ `title`/`summary` 上游带 `<em>`，工具默认去标签 | ✅ `abstract`（另有去标签版 `abstract` + 原样 `abstract_html`） |
| 搜用户 | ❌ | ✅ `type=user` |
| 搜知识库 | ✅ `type=repo` | ✅ `type=book` |
| scope 过滤 | ✅ | ✅ |
| 分页 | ✅ `page` | ✅ `p` |

---

## Cookie 态搜索语法

> 来源：语雀官方文档《高级搜索语法》(yuque/ng1qth/search-syntax)

以下语法适用于 Cookie 态 `GET /api/zsearch` 的 `q` 参数。

### 精确短语

用英文双引号 `"..."` 包裹含空格的词组，禁止分词。

```
"知识 大会"     → 匹配"知识大会"，不做分词
```

### 标题限定

`in:title` 将搜索范围限定在标题中。

```
语雀是什么 in:title     → 标题含"语雀是什么"
```

### 布尔运算符

`NOT`、`AND`、`OR` 仅用于字符串关键词，不适用于数字或日期。

| 语法 | 示例 | 效果 |
|------|------|------|
| `NOT` | `帮助文档 NOT 桌面端` | 含"帮助文档"但不含"桌面端" |
| `AND` | `帮助文档 AND 桌面端` | 同时含"帮助文档"和"桌面端" |
| `OR` | `帮助文档 OR 桌面端` | 含"帮助文档"或"桌面端" |
| 联合查询 | `帮助文档 桌面端` | 优先匹配"帮助文档 桌面端"，然后分词匹配 |

### 日期过滤

按更新时间过滤，格式 `YYYY-MM-DD`。

| 语法 | 示例 | 效果 |
|------|------|------|
| `updated:>YYYY-MM-DD` | `帮助 updated:>2021-01-01` | 2021-01-01 之后更新 |
| `updated:>=YYYY-MM-DD` | `帮助 updated:>=2021-01-01` | 2021-01-01 或之后 |
| `updated:<YYYY-MM-DD` | `帮助 updated:<2021-01-01` | 2021-01-01 之前 |
| `updated:<=YYYY-MM-DD` | `帮助 updated:<=2021-01-01` | 2021-01-01 或之前 |
| `updated:YYYY-MM-DD..YYYY-MM-DD` | `帮助 updated:2021-01-01..2021-03-01` | 日期范围内 |

### 范围限定（url:）

限定搜索特定团队、知识库或用户。

| 语法 | 示例 | 效果 |
|------|------|------|
| `url:团队主页URL` | `搜索 url:https://www.yuque.com/yuque` | 在"语雀"团队中搜索 |
| `url:知识库URL` | `搜索 url:https://www.yuque.com/yuque/changelog` | 在指定知识库中搜索 |
| `url:用户URL` | `前端 url:https://www.yuque.com/zenany` | 在指定用户中搜索 |
| `url:团队ID` | `搜索 url:yuque` | 用团队 ID 搜索 |
| `url:团队ID/知识库slug` | `about yuque url:yuque/support_en` | 用团队ID/知识库slug搜索 |

### 可见性过滤

| 语法 | 示例 | 效果 |
|------|------|------|
| `is:related` | `搜索 is:related` | 仅"与我相关" |
| `is:public` | `搜索 is:public` | 仅公开内容 |

> ⚠️ `is:related` 和 `url:` 同时使用时，`url:` 会被忽略，仅召回 `is:related` 结果。

---

## RAG 检索（`yuque_rag_search`）

> 端点：并发复用 `GET /api/v2/search` + 逐篇 `GET /api/v2/repos/docs/{id}`（Token 认证，不需要 Cookie）。
> 实现：`server/src/search/rag-search.ts`、`server/src/search/rag-search-utils.ts`。

**用途**：调用方 LLM 先自己生成 5–10 个关键词，本工具并发搜索、按 `doc_id` 去重合并，再取前 N 篇正文一次性返回，省掉多轮 `search` + `get_doc` 往返（总结由调用方 LLM 做，工具不做生成）。

### 参数

| 参数 | 类型 | 说明 | 默认 / 上限 |
|------|------|------|-------------|
| `keywords` | string | **必填**。关键词串，分隔符为逗号 `,`、中文逗号 `，`、顿号 `、` 或空白 | - |
| `scope` | string | 搜索范围，语义同 `yuque_search` 的 `scope`（`group` 或 `group/book_slug`），留空全局 | - |
| `creator` | string | 仅搜指定作者 login | - |
| `max_results` | number | 合并去重后返回的结果条数 | 默认 10，上限 50 |
| `fetch_docs` | number | 额外取前 N 篇正文 | 默认 3，上限 10 |

关键词预处理（`normalizeKeywords`）：先去掉 `[](){}`、中英文引号、书名号一类纯符号；含 `-` `.` `_` 的关键词会**同时**生成「符号换空格」和「符号删掉」两个变体（语雀分词器对这类符号几乎不命中）；去重后最多保留 **10 个**关键词，多给的会被截断，实际使用的列表回显在 `meta.keywords_used`。

### 返回结构

```json
{
  "meta": {
    "total": 10,
    "method": "rag_search",
    "keywords_used": ["符号过滤后实际使用的关键词"],
    "raw_keywords": ["调用方传入的原始关键词"],
    "docs_fetched": 3,
    "errors": ["某一路搜索/取正文失败的原因（全部成功时该键不出现）"]
  },
  "data": [
    {
      "id": 0,
      "doc_id": 0,
      "title": "去 <em> 的标题",
      "summary": "去 <em> 的摘要",
      "url": "/user/book_slug/doc_slug",
      "book_name": "知识库名",
      "book_slug": "book_slug",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "docs": [
    {
      "doc_id": 0,
      "title": "标题",
      "body": "正文全文（上游返回什么就放什么，不额外截断）",
      "url": "https://www.yuque.com/{namespace}/{slug}",
      "book_name": "知识库名"
    }
  ]
}
```

- `data` 是各关键词返回结果按顺序交错后的合并去重列表（按 `doc_id` 去重），**不做相关性重排**。
- `docs` 是按 `data` 顺序取前 `fetch_docs` 篇的正文；单篇失败只记进 `meta.errors`，其余照常返回。
- 关键词分隔后为空数组时，直接返回 `{ "meta": { "total": 0, "method": "rag_search", "keywords_used": [], "errors": [] }, "data": [], "docs": [] }`，不请求上游。
