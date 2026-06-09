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
| `id` | int | ID |
| `type` | string | `doc` / `repo` |
| `title` | string | 标题（含 `<em>` 高亮关键词） |
| `summary` | string | 摘要（含 `<em>` 高亮关键词） |
| `url` | string | 访问路径 |
| `info` | string | 归属信息 |
| `target` | object | V2Doc 或 V2Book 详情 |
| `target.book_id` | int | 所属知识库 ID |
| `target.book.namespace` | string | 知识库 namespace |
| `target.slug` | string | 文档 slug |