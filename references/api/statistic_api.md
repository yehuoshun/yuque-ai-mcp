# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 统计字段命名规则

> 下列端点共用此规则，不再重复。

所有数字字段均为 `string` 类型。`{metric}count` 后缀按时间维度扩展：

| 后缀 | 含义 |
|------|------|
| `_count` | 总量 |
| `_count_7` | 近 7 天 |
| `_count_30` | 近 30 天 |
| `_count_365` | 近一年 |

---

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

### 返回字段 (V2GroupStatistics)

| 字段 | 说明 |
|------|------|
| `bizdate` | 统计日期 (YYYYMMDD) |
| `organization_id` | 团队 ID |
| `member_count` | 成员数 |
| `collaborator_count` | 协作者数 |
| `day_read_count` | 当日阅读量 |
| `day_write_count` | 当日编辑次数 |
| `doc_count` | 文档数量 |
| `sheet_count` | 表格数量 |
| `board_count` | 画板数量 |
| `show_count` | 演示文稿数量 |
| `resource_count` | 资源数量 |
| `artboard_count` | 图集数量 |
| `attachment_count` | 附件数量 |
| `book_count` | 知识库总数 |
| `public_book_count` | 公开知识库数 |
| `private_book_count` | 私密知识库数 |
| `book_book_count` | 文档知识库数 |
| `book_resource_count` | 资源知识库数 |
| `book_design_count` | 图片知识库数 |
| `book_thread_count` | 话题知识库数 |
| `data_usage` | 流量使用量 |
| `grains_count` | 当前稻谷数 |
| `grains_count_sum` | 累计获得稻谷数 |
| `grains_count_consume` | 已消耗稻谷数 |
| `interaction_people_count` | 知识交流人数 |
| `content_count` | 知识财富数 |
| `collaboration_count` | 知识协同次数 |
| `working_hours` | 协同提效时长（小时） |
| `baike` | 百科全书卷数 |
| `table_count` | 数据表数量 |

以下指标也适用时间维度规则（_count, _count_30, _count_365）：`write`, `read`, `comment`, `like`, `follow`, `collect`

---

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
| `range` | query | int | 0=全部 / 30=近30天 / 365=近一年 | 0 |
| `page` | query | int | 页码 | 1 |
| `limit` | query | int | 每页数量 | 10（≤20） |
| `sortField` | query | string | write_doc_count / write_count / read_count / like_count | - |
| `sortOrder` | query | string | desc / asc | desc |

### 返回字段 (V2MemberStatistics)

| 字段 | 说明 |
|------|------|
| `members.user_id` | 成员 ID |
| `members.user` | 成员名 |

适用时间维度规则（_count, _count_30, _count_365）的指标：`write`, `write_doc`, `read`, `like`

---

## 团队知识库统计数据

```http
GET /api/v2/groups/{login}/statistics/books?range={range}&sortField={sortField}&sortOrder={sortOrder}&limit={limit}
```

**用途**：获取团队知识库维度的统计数据，支持名称过滤、时间范围和排序。

### 参数

同成员统计，`sortField` 支持的值为：content_updated_at_ms / word_count / post_count / read_count / like_count / watch_count / comment_count。

### 返回字段 (V2BookStatistics)

| 字段 | 说明 |
|------|------|
| `books.book_id` | 知识库 ID |
| `books.name` | 知识库名称 |
| `books.slug` | 知识库路径 |
| `books.type` | 知识库类型 |
| `books.is_public` | 是否公开 |
| `books.post_count` | 文档数 |
| `books.word_count` | 字数 |
| `books.popularity_30` | 30天热度 |
| `books.like_rank_rate` | 点赞数排名 |

适用时间维度规则的指标：`write`（_count, _count_30）、`read`（_count, _count_30, _count_365）、`like`（_count, _count_7, _count_30, _count_365）、`watch`（_count, _count_7, _count_30, _count_365）、`comment`（_count, _count_30, _count_365）

---

## 团队文档统计数据

```http
GET /api/v2/groups/{login}/statistics/docs?range={range}&sortField={sortField}&sortOrder={sortOrder}&limit={limit}
```

**用途**：获取团队文档维度的统计数据，支持按知识库/文档名过滤。

### 参数

同知识库统计，额外支持 `bookId`（指定知识库 ID）。`sortField` 支持：content_updated_at / word_count / read_count / like_count / comment_count / created_at。

### 返回字段 (V2DocStatistics)

| 字段 | 说明 |
|------|------|
| `docs.doc_id` | 文档 ID |
| `docs.title` | 文档标题 |
| `docs.slug` | 文档路径 |
| `docs.book_id` | 所属知识库 ID |
| `docs.type` | 文档类型 |
| `docs.is_public` | 是否公开 |
| `docs.created_at` | 创建时间 |
| `docs.content_updated_at` | 最近更新时间 |
| `docs.word_count` | 字数 |
| `docs.popularity_30` | 30天热度 |

适用时间维度规则的指标：`read`（_count, _count_7, _count_30, _count_365）、`like`（_count, _count_7, _count_30, _count_365）、`comment`（_count, _count_30, _count_365）