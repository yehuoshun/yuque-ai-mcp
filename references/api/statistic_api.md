# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

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