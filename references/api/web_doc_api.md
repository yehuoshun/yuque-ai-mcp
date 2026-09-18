# web_doc_api

## 概述

`web_doc` 域提供语雀 Web API（`/api/*`）的调用能力，需要 Cookie 登录态认证（`cookie` + `ctoken`）。

与 v2 OpenAPI（`X-Auth-Token` 认证）不同，这些端点使用浏览器 Cookie 会话认证，适用于：

- **会员过期限流时的备用通道**：v2 API 被限流时，用 Cookie 态读写兜底
- **目录节点（catalog node）操作**：v2 OpenAPI 不提供的目录移动/复制/批量操作
- **更丰富的字段**：返回含权限信息、完整 book/user 对象等 v2 未暴露的字段

> ⚠️ 这些端点依赖语雀私有 Web API，语雀改版可能导致端点失效。

## 配置

在 `config/config.json` 中配置：

```json
{
  "cookie": "lang=zh-cn; _yuque_session=...; yuque_ctoken=...; tfstk=...",
  "ctoken": "从 Cookie 中提取的 yuque_ctoken 值"
}
```

获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 `_yuque_session` 和 `yuque_ctoken`。

## 工具索引

| 工具 | 端点 | 说明 |
|------|------|------|
| `yuque_web_get_doc` | `GET /api/docs/{id}` | 读文档正文（含 body/content），不受会员过期限流 |
| `yuque_web_list_docs` | `GET /api/docs` | 列文档列表，字段更丰富 |
| `yuque_web_list_repos` | `GET /api/books` | 列知识库列表，含权限信息 |
| `yuque_web_get_toc` | `GET /api/catalog_nodes` | 获取知识库目录 TOC |
| `yuque_web_delete_doc` | `DELETE /api/docs/{id}` | 删除文档（移入回收站，v2 被限流时的备用通道） |
| `yuque_web_move_catalog_node` | `PUT /api/catalog_nodes/move` | 移动目录节点 |
| `yuque_web_copy_catalog_node` | `PUT /api/catalog_nodes/copy` | 复制目录节点 |
| `yuque_web_batch_move_catalog_nodes` | `PUT /api/catalog_nodes/batch` | 批量移动目录节点 |

## 文档类工具

### yuque_web_get_doc

**端点**：`GET /api/docs/{id}?book_id={book_id}`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 文档 ID（数字） |
| `book_id` | string | ✅ | 知识库 ID（数字） |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false，返回裁剪字段） |

### yuque_web_list_docs

**端点**：`GET /api/docs?book_id={book_id}&offset={offset}&limit={limit}`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID（数字） |
| `offset` | number | ❌ | 分页偏移，默认 0 |
| `limit` | number | ❌ | 每页数量，默认 100，最大 100 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

### yuque_web_list_repos

**端点**：`GET /api/books?offset={offset}&limit={limit}`（不传 `user_id` 时自动从 `/api/mine` 获取当前用户）

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | ❌ | 用户 ID（数字），默认当前用户 |
| `offset` | number | ❌ | 分页偏移，默认 0 |
| `limit` | number | ❌ | 每页数量，默认 100，最大 100 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

### yuque_web_get_toc

**端点**：`GET /api/catalog_nodes?book_id={book_id}`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID（数字） |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

### yuque_web_delete_doc

**端点**：`DELETE /api/docs/{id}?book_id={book_id}`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 文档 ID（数字） |
| `book_id` | string | ✅ | 知识库 ID（数字） |
| `confirm` | string | ✅ | 需传 `'DELETE'` 确认删除 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

## 目录节点工具

> ⚠️ 目录节点（catalog node）操作必须使用 Web 目录（`/api/catalog_nodes`）里的 `node_uuid`，v2 TOC（`/api/v2/repos/:id/toc`）的 uuid 可能对不上。

### yuque_web_move_catalog_node

**端点**：`PUT /api/catalog_nodes/move`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 节点当前所在知识库 ID（数字） |
| `node_uuid` | string | ✅ | 要移动的目录节点 UUID |
| `target_book_id` | string | ❌ | 目标知识库 ID，跨库移动时填，默认同库 |
| `target_uuid` | string | ❌ | 目标父节点 UUID，空则移到目标库根目录 |
| `action` | string | ❌ | `prependChild`（首位子节点，默认）/ `appendChild`（末尾子节点） |
| `with_children` | boolean | ❌ | 是否连同子树一起移动，默认 true |
| `insert_to_catalog` | boolean | ❌ | 是否写入目录 TOC，默认 true |

### yuque_web_copy_catalog_node

**端点**：`PUT /api/catalog_nodes/copy`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 源知识库 ID（数字） |
| `node_uuid` | string | ✅ | 要复制的目录节点 UUID（必须在 Web 目录中） |
| `target_book_id` | string | ✅ | 目标知识库 ID（数字） |
| `target_uuid` | string | ❌ | 目标父节点 UUID，空则复制到目标库根目录 |
| `action` | string | ❌ | `prependChild`（默认）/ `appendChild` |
| `with_children` | boolean | ❌ | 是否连同子树一起复制，默认 false |
| `insert_to_catalog` | boolean | ❌ | 是否写入目录 TOC，默认 true |

### yuque_web_batch_move_catalog_nodes

**端点**：`PUT /api/catalog_nodes/batch`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `node_uuids` | string | ✅ | JSON 数组字符串，如 `'["uuid1","uuid2"]'` |
| `target_uuid` | string | ✅ | 目标父节点 UUID |
| `book_id` | string | ✅ | 节点当前所在知识库 ID（数字） |
| `target_book_id` | string | ❌ | 目标知识库 ID，跨库移动时填，默认同库 |
