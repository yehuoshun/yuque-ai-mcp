# 语雀 OpenAPI 参考

> 来源：语雀官方 OpenAPI 文档
> 基地址：`https://www.yuque.com/api/v2`

## 认证

所有 API 请求需携带 Token：

```http
X-Auth-Token: {token}
```

## 用户 API
## API 限制

| 限制项 | 上限 |
|--------|------|
| 单知识库文档数 | 5000 |
| API QPS | 100/s |
| API 每小时请求 | 5000/h |
| 文档标题字数 | 200 |

## 错误处理

### 错误响应格式

```json
{
  "status": 401,
  "message": "Unauthorized",
  "errors": [
    {
      "code": "invalid_token",
      "message": "Token is invalid or expired"
    }
  ]
}
```

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求参数错误 | 输出错误信息，检查参数格式 |
| 401 | Token 无效或已过期 | 重新生成 Token 后更新配置 |
| 403 | 权限不足 | 说明缺少的权限，检查 Token 权限范围 |
| 404 | 资源不存在 | 文档/知识库/小记可能已被删除或 ID 错误 |
| 410 | 资源已删除 | 资源已被删除或 API 端点已废弃 |
| 429 | 请求过于频繁 | 检查 `X-RateLimit-Remaining`：`=0` 触及 5000/h → 立即暂停，保存进度，通知用户整点后重新触发；`>0` 触及 100/s → 等待 1s 重试（最多 3 次） |
| 500 | 语雀服务器内部错误 | 稍后重试 |
| 502/503/504 | 网关错误 | 稍后重试 |

## 速率限制

### 响应头

每次 API 调用都会返回以下响应头：

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 总次数限制（每小时） |
| `X-RateLimit-Remaining` | 剩余可用次数 |

**使用方式**：每次请求后检查 `X-RateLimit-Remaining`，合理控制请求节奏。

---

## Web API（非 v2，需 Cookie 登录态）

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
