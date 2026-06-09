# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 通用搜索

```http
GET /api/v2/search?q={q}&type={type}&scope={scope}&page={page}
```

> ⚠️ `list_docs` 端点无搜索参数，搜索只能用此接口。
> ⚠️ **符号匹配极差**：对 `[]`、`-`、`_` 等符号分词能力很弱，标题避免符号前缀。

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