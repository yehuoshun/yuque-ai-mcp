# web_doc_api

## 概述

`web_doc` 域提供语雀 Web API（`/api/*`）的调用能力，需要 Cookie 登录态认证（`cookie` + `ctoken`）；登录态**只发往 `*.yuque.com` 域名**，其它域名一律拒绝（见「配置」）。

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

> **登录态不会外泄到非语雀域名**：请求层 `common/web-request.ts:42-43` 会解析 URL 的 hostname，凡不是 `www.yuque.com`、也不以 `.yuque.com` 结尾的，直接返回错误「拒绝向非语雀域名发送登录态」，**不会**附带 cookie / ctoken（这是唯一的登录态出口，防的是把文档正文里抽出的外链当 API 调用）。

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
| `id` | string | ✅ | 文档 ID 或 **slug** |
| `book_id` | string | ✅ | 知识库 ID：**支持 namespace/slug（如 `group/book_slug`）或纯数字**，原样透传、不做 `Number` 强转 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false，返回裁剪字段） |

> `id` 与 `book_id` 都以字符串原样拼进 `/api/docs/{id}?book_id={book_id}`：`id` 可传文档 slug，`book_id` 可传 namespace/slug（如 `group/book_slug`）或数字，代码不做 `Number` 强转，仅在 `encodeURIComponent` 之后把 `%2F` 还原成 `/`，以保住 namespace 里的斜杠（`web-doc/get-doc.ts:90,111-116`）。
>
> ⚠️ **此处曾有相反结论、存在矛盾**：本节旧版写「`book_id` 必须是数字，传 `group/book_slug` / `utuif2` 都会 404」并自称实测。本次只核对了代码（代码明确声明支持并有意透传 namespace），**未重跑上游实测**，两边都自称实测，建议实测复核后再定稿。

### yuque_web_list_docs

**端点**：`GET /api/docs?book_id={book_id}&offset={offset}&limit={limit}`

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID（数字） |
| `offset` | number | ❌ | 分页偏移，默认 0；**上游不可靠，`>0` 可能返回 `OFFSET_NOT_SUPPORTED`**（见下） |
| `limit` | number | ❌ | 每页数量，默认 100，最大 100 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

> ⚠️ **`offset` 上游不可靠**：`/api/docs` 可能忽略 `offset`（代码注释记录同族 `/api/books` 已实测如此，`/api/docs` 有同样风险）。当 `offset>0` 且上游返回不足一页时，工具会再探一次 `offset=0` 的首页，若首条 `id` 与本次首条相同，即判定 offset 被无视，返回 `isError` 的 `OFFSET_NOT_SUPPORTED`（附 `offset`、`limit`），而**不会**静默把第一页当成第 `offset` 条返回；此时应改用 `limit` 翻页或始终从 `offset=0` 取值（`web-doc/list-docs.ts:112-128`）。
>
> 上游**返回超过 `limit`** 时也有保护：工具同样探一次 `offset=0` 首页，若首条 `id` 与本次首条**不同**，说明上游不是从 0 开始给的，`slice(offset, offset+limit)` 会切错页，此时返回 `isError` 的 `INCONSISTENT_PAGE`（附 `offset`、`limit`、`returned`），不静默错页。
>
> 返回结构：`total`（上游 `meta.total`，取不到为 `null`）、`total_is_partial`（上游未给 total 时为 `true`）、`offset`、`limit`、`returned`（本页条数）、`has_more`、`data`。上游返回超过 `limit` 且已确认从 `offset=0` 开始时，在本地切片（`web-doc/list-docs.ts:106-147`）。

### yuque_web_list_repos

**端点**：`GET /api/books?offset={offset}&limit={limit}`（不传 `user_id` 时自动从 `/api/mine` 获取当前用户）

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | ❌ | 用户 ID（数字），默认当前用户 |
| `offset` | number | ❌ | 分页偏移，默认 0；**上游忽略 `offset`（`/api/books` 实测连 `limit` 也不吃），`>0` 会返回 `OFFSET_NOT_SUPPORTED`**（见下） |
| `limit` | number | ❌ | 每页数量，默认 100，最大 100 |
| `raw` | boolean | ❌ | 返回原始 JSON（默认 false） |

> ⚠️ **`offset` 上游不支持**：`/api/books` 实测忽略 `offset`/`limit`（`limit=1` 仍返回全部，约 787 条 / 715 KB）。因此 `offset>0` 时会再探一次 `offset=0` 首页，首条 `id` 相同即返回 `isError` 的 `OFFSET_NOT_SUPPORTED`；返回条数大于 `limit` 时说明上游没分页，工具会在本地切片（`web-doc/list-repos.ts:104-128`）。
>
> 返回结构：`total`、`total_is_partial`、`offset`、`limit`、`returned`、`has_more`、`data`（`web-doc/list-repos.ts:130-132,146`）。

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

> ⚠️ **该接口会「假成功」**：`PUT /api/catalog_nodes/move` 常常返回 HTTP 200 但节点根本没动。所以工具在请求成功后**回读目标库 TOC 轮询校验 3 次**（间隔 0 / 400 / 800ms），确认节点的 `parent_uuid` 等于 `target_uuid`（`target_uuid` 为空则要求位于根目录）才算成功（`web-doc/move-catalog-node.ts:20-50,149-165`）。
>
> - 成功：`{ success: true, verified: true, book_id, target_book_id, node_uuid, target_uuid, action, with_children, cross_repo, message }`
> - 校验未通过：`isError` + `{ success: false, error: "MOVE_NOT_APPLIED", message, book_id, target_book_id, node_uuid, target_uuid, node_found_in_target, observed_parent_uuid }`
>
> 收到 `MOVE_NOT_APPLIED` 时节点可能仍在原位（看 `observed_parent_uuid`），也可能整条被上游丢弃（`node_found_in_target: false`），需人工确认后再重试，不要盲目重发。

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
| `node_uuids` | string[] 或 string | ✅ | 字符串数组（推荐）或 JSON 数组字符串，如 `["uuid1","uuid2"]` / `'["uuid1","uuid2"]'` |
| `target_uuid` | string | ✅ | 目标父节点 UUID |
| `book_id` | string | ✅ | 节点当前所在知识库 ID（数字） |
| `target_book_id` | string | ❌ | 目标知识库 ID，跨库移动时填，默认同库 |

> ⚠️ **同样是「假成功」接口**：`PUT /api/catalog_nodes/batch` 只要 HTTP 200 就返回，实际可能一个节点都没动。工具在请求成功后**回读目标库 TOC 轮询 3 次**，逐个核对 `parent_uuid === target_uuid`，绝不把「请求条数」当成「移动条数」（`web-doc/batch-move-catalog-nodes.ts:19-51,186-205`）。
>
> - 全部落位：`{ success: true, verified: true, moved_count, node_uuids, target_uuid, book_id, target_book_id, cross_repo, message }`
> - 有节点没落位：`isError` + `{ success: false, error: "BATCH_MOVE_PARTIAL_OR_NOT_APPLIED", message, book_id, target_book_id, target_uuid, moved_count, moved, not_moved, verify_error }`，其中 `moved_count` 是**回读确认**的条数，`not_moved` 是未落位的 UUID 列表（两者之和等于传入条数）
>
> 该接口的 `batch_action: "batchMove"`、`transfer_action: "prependChild"`、`insert_to_catalog: true` 均由代码写死，不可配置（`web-doc/batch-move-catalog-nodes.ts:168-176`）。
