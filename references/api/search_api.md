# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

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
| `p` | query | int | 页码 | 1-based，默认 1 |
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
| `_record` | object | 完整对象（等同于 get_doc / get_repo 返回值） |

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

### 与 API v2 搜索对比

| | API v2 `GET /search` | Cookie `GET /api/zsearch` |
|---|---|---|
| 认证 | Token | Cookie + ctoken |
| 返回文档 | 摘要（需二次 get_doc） | 完整 `_record` |
| 总数 | ❌ | ✅ `totalHits` |
| 高亮摘要 | ❌ | ✅ `abstract` |
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
