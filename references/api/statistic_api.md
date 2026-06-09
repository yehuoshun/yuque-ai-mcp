# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 团队汇总统计数据

```http
GET /api/v2/groups/{login}/statistics
```

**用途**：获取团队维度的汇总统计数据。

> ⚠️ Token 需要 `statistic:read` 权限。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `login` | path | string | 团队的 Login 或 ID（必填） |

### 返回结构

```json
{
  "data": {
    "bizdate": "string",
    "user_id": "string",
    "organization_id": "string",
    "member_count": "string",
    "collaborator_count": "string",
    "day_read_count": "string",
    "day_write_count": "string",
    "write_count": "string",
    "read_count": "string",
    "read_count_30": "string",
    "read_count_365": "string",
    "comment_count": "string",
    "comment_count_30": "string",
    "comment_count_365": "string",
    "like_count": "string",
    "like_count_30": "string",
    "like_count_365": "string",
    "follow_count": "string",
    "collect_count": "string",
    "doc_count": "string",
    "sheet_count": "string",
    "board_count": "string",
    "show_count": "string",
    "resource_count": "string",
    "artboard_count": "string",
    "attachment_count": "string",
    "book_count": "string",
    "public_book_count": "string",
    "private_book_count": "string",
    "book_book_count": "string",
    "book_resource_count": "string",
    "book_design_count": "string",
    "book_thread_count": "string",
    "data_usage": "string",
    "grains_count": "string",
    "grains_count_sum": "string",
    "grains_count_consume": "string",
    "interaction_people_count": "string",
    "content_count": "string",
    "collaboration_count": "string",
    "working_hours": "string",
    "baike": "string",
    "table_count": "string"
  }
}
```

### 返回字段 (V2GroupStatistics)

| 字段 | 类型 | 说明 |
|------|------|------|
| `bizdate` | string | 统计日期 (YYYYMMDD) |
| `organization_id` | string | 团队 ID |
| `member_count` | string | 成员数 |
| `collaborator_count` | string | 协作者数 |
| `day_read_count` | string | 当日阅读量 |
| `day_write_count` | string | 当日编辑次数 |
| `write_count` | string | 编辑次数 |
| `read_count` | string | 阅读量 |
| `read_count_30` | string | 阅读量（30天） |
| `read_count_365` | string | 阅读量（一年） |
| `comment_count` | string | 评论量 |
| `comment_count_30` | string | 评论量（30天） |
| `comment_count_365` | string | 评论量（一年） |
| `like_count` | string | 点赞量 |
| `like_count_30` | string | 点赞量（30天） |
| `like_count_365` | string | 点赞量（一年） |
| `follow_count` | string | 关注量 |
| `collect_count` | string | 收藏量 |
| `doc_count` | string | 文档数量 |
| `sheet_count` | string | 表格数量 |
| `board_count` | string | 画板数量 |
| `show_count` | string | 演示文稿数量 |
| `resource_count` | string | 资源数量 |
| `artboard_count` | string | 图集数量 |
| `attachment_count` | string | 附件数量 |
| `book_count` | string | 知识库总数 |
| `public_book_count` | string | 公开知识库数 |
| `private_book_count` | string | 私密知识库数 |
| `book_book_count` | string | 文档知识库数 |
| `book_resource_count` | string | 资源知识库数 |
| `book_design_count` | string | 图片知识库数 |
| `book_thread_count` | string | 话题知识库数 |
| `data_usage` | string | 流量使用量 |
| `grains_count` | string | 当前稻谷数 |
| `grains_count_sum` | string | 累计获得稻谷数 |
| `grains_count_consume` | string | 已消耗稻谷数 |
| `interaction_people_count` | string | 知识交流人数 |
| `content_count` | string | 知识财富数 |
| `collaboration_count` | string | 知识协同次数 |
| `working_hours` | string | 协同提效时长（小时） |
| `baike` | string | 百科全书卷数 |
| `table_count` | string | 数据表数量 |

## 团队成员统计数据

```http
GET /api/v2/groups/{login}/statistics/members?range={range}&sortField={sortField}&sortOrder={sortOrder}&limit={limit}
```

**用途**：获取团队成员维度的统计数据，支持姓名过滤、时间范围和排序。

> ⚠️ Token 需要 `statistic:read` 权限。limit ≤ 20。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 团队的 Login 或 ID（必填） | - |
| `name` | query | string | 成员名过滤 | - |
| `range` | query | int | 时间范围：0=全部 / 30=近30天 / 365=近一年 | 0 |
| `page` | query | int | 页码 | 1 |
| `limit` | query | int | 每页数量 | 10（≤20） |
| `sortField` | query | string | 排序字段：write_doc_count / write_count / read_count / like_count | - |
| `sortOrder` | query | string | 排序方向：desc / asc | desc |

### 返回结构

```json
{
  "data": {
    "members": {
      "bizdate": "string",
      "user_id": "string",
      "group_id": "string",
      "organization_id": "string",
      "write_count": "string",
      "write_count_30": "string",
      "write_count_365": "string",
      "write_doc_count": "string",
      "write_doc_count_30": "string",
      "write_doc_count_365": "string",
      "read_count": "string",
      "read_count_30": "string",
      "read_count_365": "string",
      "like_count": "string",
      "like_count_30": "string",
      "like_count_365": "string",
      "user": "string"
    },
    "total": 0
  }
}
```

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `members` | object | 成员统计数组 |
| `members.user_id` | string | 成员 ID |
| `members.user` | string | 成员名 |
| `members.write_count` | string | 编辑次数 |
| `members.write_count_30` | string | 编辑次数（30天） |
| `members.write_count_365` | string | 编辑次数（一年） |
| `members.write_doc_count` | string | 编辑文档数 |
| `members.write_doc_count_30` | string | 编辑文档数（30天） |
| `members.write_doc_count_365` | string | 编辑文档数（一年） |
| `members.read_count` | string | 阅读量 |
| `members.read_count_30` | string | 阅读量（30天） |
| `members.read_count_365` | string | 阅读量（一年） |
| `members.like_count` | string | 点赞量 |
| `members.like_count_30` | string | 点赞量（30天） |
| `members.like_count_365` | string | 点赞量（一年） |
| `total` | int | 总数量 |

## 团队知识库统计数据

```http
GET /api/v2/groups/{login}/statistics/books?range={range}&sortField={sortField}&sortOrder={sortOrder}&limit={limit}
```

**用途**：获取团队知识库维度的统计数据，支持名称过滤、时间范围和排序。

> ⚠️ Token 需要 `statistic:read` 权限。limit ≤ 20。

### 参数

同成员统计，`sortField` 支持的值为：content_updated_at_ms / word_count / post_count / read_count / like_count / watch_count / comment_count。

### 返回字段 (V2BookStatistics)

| 字段 | 类型 | 说明 |
|------|------|------|
| `books.book_id` | string | 知识库 ID |
| `books.name` | string | 知识库名称 |
| `books.slug` | string | 知识库路径 |
| `books.type` | string | 知识库类型 |
| `books.is_public` | string | 是否公开 |
| `books.post_count` | string | 文档数 |
| `books.word_count` | string | 字数 |
| `books.read_count` | string | 阅读量 |
| `books.read_count_30` | string | 阅读量（30天） |
| `books.read_count_365` | string | 阅读量（一年） |
| `books.like_count` | string | 点赞量 |
| `books.like_count_7` | string | 点赞量（7天） |
| `books.like_count_30` | string | 点赞量（30天） |
| `books.like_count_365` | string | 点赞量（一年） |
| `books.watch_count` | string | 关注量 |
| `books.watch_count_7` | string | 关注量（7天） |
| `books.watch_count_30` | string | 关注量（30天） |
| `books.watch_count_365` | string | 关注量（一年） |
| `books.comment_count` | string | 评论量 |
| `books.popularity_30` | string | 30天热度 |
| `books.like_rank_rate` | string | 点赞数排名 |
| `books.popularity_30` | string | 30天热度 |
| `total` | int | 总数量 |

## 团队文档统计数据

```http
GET /api/v2/groups/{login}/statistics/docs?range={range}&sortField={sortField}&sortOrder={sortOrder}&limit={limit}
```

**用途**：获取团队文档维度的统计数据，支持按知识库/文档名过滤、时间范围和排序。

> ⚠️ Token 需要 `statistic:read` 权限。limit ≤ 20。

### 参数

同知识库统计，额外支持 `bookId`（指定知识库 ID）过滤。`sortField` 支持的值为：content_updated_at / word_count / read_count / like_count / comment_count / created_at。

### 返回字段 (V2DocStatistics)

| 字段 | 类型 | 说明 |
|------|------|------|
| `docs.doc_id` | string | 文档 ID |
| `docs.title` | string | 文档标题 |
| `docs.slug` | string | 文档路径 |
| `docs.book_id` | string | 所属知识库 ID |
| `docs.type` | string | 文档类型 |
| `docs.is_public` | string | 是否公开 |
| `docs.created_at` | string | 创建时间 |
| `docs.content_updated_at` | string | 最近更新时间 |
| `docs.word_count` | string | 字数 |
| `docs.read_count` | string | 阅读量 |
| `docs.read_count_7` | string | 阅读量（7天） |
| `docs.read_count_30` | string | 阅读量（30天） |
| `docs.read_count_365` | string | 阅读量（一年） |
| `docs.like_count` | string | 点赞量 |
| `docs.like_count_7` | string | 点赞量（7天） |
| `docs.like_count_30` | string | 点赞量（30天） |
| `docs.like_count_365` | string | 点赞量（一年） |
| `docs.comment_count` | string | 评论量 |
| `docs.popularity_30` | string | 30天热度 |
| `total` | int | 总数量 |