# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取知识库的文档列表

```http
GET /api/v2/repos/{book_id}/docs?offset={offset}&limit={limit}&optional_properties={optional_properties}
```

等价于 `GET /api/v2/repos/{group_login}/{book_slug}/docs`，`book_id` 支持数字 ID 或 namespace。

**用途**：获取指定知识库下的文档列表，支持分页和额外字段。

> ⚠️ `limit` 超过 100 时返回 422 参数校验失败。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） | - |
| `offset` | query | int | 偏移量（分页） | 0 |
| `limit` | query | int | 每页数量 | 100（≤100） |
| `optional_properties` | query | string | 额外字段，逗号分隔。支持 `hits`、`tags`、`latest_version_id` | - |

### 返回结构

```json
{
  "meta": {
    "total": 0
  },
  "data": [
    {
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
  ]
}
```

### 返回字段

#### meta

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | int | 文档总数 |

#### data[] (V2Doc)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 文档 ID |
| `type` | string | 文档类型：Doc/Sheet/Thread/Board/Table |
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
| `hits` | int | Deprecated，阅读数（需 optional_properties=hits） |
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
| `latest_version_id` | int | 最新版本号（需 optional_properties=latest_version_id） |
| `tags` | object | V2Tag，标签（需 optional_properties=tags） |

#### book (V2Book)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `type` | string | 类型：Book/Design/Sheet/Resource |
| `slug` | string | 路径 |
| `name` | string | 名称 |
| `user_id` | int | 归属用户/团队 ID |
| `description` | string | 简介 |
| `creator_id` | int | 创建者 ID |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `items_count` | int | 文档数量 |
| `likes_count` | int | 点赞数 |
| `watches_count` | int | 订阅数 |
| `content_updated_at` | string | META 更新时间 (ISO 8601) |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `user` | object | V2User，创建者 |
| `namespace` | string | 完整路径 |