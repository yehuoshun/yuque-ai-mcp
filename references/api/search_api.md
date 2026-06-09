# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

> ⚠️ 搜索只能用 `/api/v2/search`，`list_docs` 端点无搜索参数。
>
> ⚠️ **符号匹配极差**：语雀搜索对符号（`[]`、`-`、`_` 等）的分词/匹配能力很弱。
> 文档标题中避免使用括号、连字符等符号前缀，直接用纯文本关键词。
> 例如：用 `SpringBoot` 而非 `[索引] SpringBoot`，用 `路由 Java` 而非 `[路由] Java`。

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