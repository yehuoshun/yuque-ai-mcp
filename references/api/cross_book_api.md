# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

以下端点不在 v2 OpenAPI 范围内，需浏览器 Cookie + CSRF Token 认证。

### 知识库分组

```http
GET https://www.yuque.com/api/mine/book_stacks
```

**请求头**：

| 头 | 值 |
|----|-----|
| `Cookie` | 完整浏览器 Cookie 字符串 |
| `x-csrf-token` | `yuque_ctoken` 的值 |
| `Referer` | `https://www.yuque.com/dashboard/books` |

**返回**：JSON 对象，`data` 数组包含分组结构，每个分组含 `name`（分组名）和 `books`（该分组下的知识库列表）。

**对应 MCP Tool**：`yuque_list_repo_groups`

---

## 跨库复制（cross-book copy）

### yuque_copy_docs_cross_book

跨知识库批量复制文档。源库不动，只复制到目标库。

**参数**：
- `source_book_id` (number|string) — 源知识库 ID 或 namespace
- `target_book_id` (number|string) — 目标知识库 ID 或 namespace
- `doc_ids` (number[], 可选) — 指定文档 ID，不传则复制全部
- `concurrency` (number, 默认 3) — 并行数

**返回**：
```json
{
  "source_book_id": "...",
  "target_book_id": "...",
  "total": 100,
  "succeeded": 98,
  "failed": 2,
  "results": [
    {"doc_id": 123, "title": "xxx", "success": true, "new_doc_id": 456},
    {"doc_id": 124, "title": "yyy", "success": false, "error": "..."}
  ]
}
```

**使用场景**：
- A 库整理到 B 库，源库不动
- 知识库归档前先预览效果
