# 语雀 OpenAPI 参考 — 画板资源

> 基地址：`https://www.yuque.com/api/v2`
> 认证：`X-Auth-Token`（`config.json` 的 `token` 字段，v2 OpenAPI Token）

画板资源（Board）是语雀文档中嵌入的思维导图、流程图、架构图等可视化组件。

本域 3 个工具（`server/src/board/`）：`yuque_get_board`、`yuque_create_board`、`yuque_update_board`。

## 工具索引

| 工具 | 端点 | 说明 |
|------|------|------|
| `yuque_get_board` | `GET /api/v2/yfm/boards` | 获取画板资源 JSON DSL 与摘要信息 |
| `yuque_create_board` | `POST /api/v2/yfm/boards` | 在文档中创建画板资源 |
| `yuque_update_board` | `PUT /api/v2/yfm/boards` | 更新已有画板资源（`text` 或 `dsl` 二选一） |

---

## yuque_get_board — 获取画板资源

**端点**：

```http
GET /api/v2/yfm/boards?resource_type=board&src={resource_id}&doc_id={doc_id}
GET /api/v2/yfm/boards?resource_type=board&src={resource_id}&url={doc_url}
```

**用途**：获取文档中指定画板资源的 JSON DSL 和摘要信息。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `resource_id` | string | ✅ | 画板资源 ID，从 `board://<resource_id>` 提取；发送时映射为上游 query `src` |
| `doc_id` | number | ❌ | 文档 ID（与 `url` 至少传一个） |
| `url` | string | ❌ | 文档 URL（与 `doc_id` 至少传一个） |

> **必填口径**：schema 只声明 `required: ["resource_id"]`；`doc_id` / `url` 由 handler 运行时校验，两者都缺时直接返回 `{"error": "请提供 doc_id 或 url / Provide doc_id or url"}`，不请求上游。两者同时传则都发送（工具不做互斥校验）。
> `resource_type=board` 与 `src=resource_id` 由工具固定拼装，无需传。

### 返回

MCP 原样透传上游 JSON（不做字段裁剪，无 `raw` 参数）；下列字段形状为语雀返回的示例，工具不增删字段：

```json
{
  "data": {
    "id": "画板资源 ID",
    "type": "mindmap | flowchart | architecturediagram",
    "dsl": {},
    "text": "DSL 文本表示",
    "summary": {
      "node_count": 15,
      "edge_count": 14,
      "depth": 3
    }
  }
}
```

> `dsl` 是画板 DSL 对象，结构由 `type` 决定（示例中省略内容）。
>
> 上游报错（400/401/403/404/422）时 `isError: true`，`content[0].text` 为**纯文本** `{context} failed — {状态描述}`（例：`Get board failed — Not found — entity does not exist`）；状态码与业务码语义见 [errors.md](./errors.md)。

---

## yuque_create_board — 创建画板资源

**端点**：`POST /api/v2/yfm/boards`（`Content-Type: application/json`）

**用途**：在文档中创建新的画板资源（思维导图/流程图/架构图）。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `type` | string | ✅ | 画板类型：`mindmap`、`flowchart`、`architecturediagram` |
| `dsl` | string | ✅ | 画板 DSL 文本内容，格式取决于 `type` |
| `doc_id` | number | ❌ | 文档 ID（与 `url` 至少传一个） |
| `url` | string | ❌ | 文档 URL（与 `doc_id` 至少传一个） |
| `insert_after_lake_id` | string | ❌ | 插入到指定 Lake 节点之后；省略则追加到文档末尾 |

> schema 必填为 `["type", "dsl"]`；`doc_id` / `url` 由 handler 校验，都缺时返回 `{"error": "请提供 doc_id 或 url / Provide doc_id or url"}`；两者同时传则都发送（工具不做互斥校验）。
> `resource_type: "board"` 由工具固定写入请求体，无需传。

### 请求体（工具实际发送）

```json
{
  "resource_type": "board",
  "type": "mindmap",
  "dsl": "中心主题\n  分支 A\n    叶子 1\n  分支 B",
  "doc_id": 123456
}
```

> `insert_after_lake_id` 仅在传入时才出现在请求体里。

### 返回

原样透传上游 JSON（同 `yuque_get_board`：不裁剪字段、无 `raw` 参数），成功时通常形如 `{"data": {...}}`（以语雀实际返回为准）；错误形态同上。

---

## yuque_update_board — 更新画板资源

**端点**：`PUT /api/v2/yfm/boards`（`Content-Type: application/json`）

**用途**：更新文档中已有的画板资源内容。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `resource_id` | string | ✅ | 画板资源 ID（从 `board://<resource_id>` 提取）；发送时映射为上游请求体 `src`（必填，缺失由工具层直接拦截） |
| `text` | string | ❌ | 新的 DSL 文本内容（与 `dsl` 二选一） |
| `dsl` | string | ❌ | 新的 JSON DSL——**MCP 层收 JSON 字符串**（如 `{"root": "..."}` 的字符串形式）；工具先 `JSON.parse`，解析失败则按原字符串放进上游 `dsl` 字段 |
| `doc_id` | number | ❌ | 文档 ID（与 `url` 至少传一个） |
| `url` | string | ❌ | 文档 URL（与 `doc_id` 至少传一个） |

> **必填口径**：schema 只有 `required: ["resource_id"]`；`text` / `dsl` 至少传一个，两者都缺时返回 `{"error": "请提供 text 或 dsl（二选一）/ Provide text or dsl (choose one)"}`。
> ⚠️ 同时传 `text` 与 `dsl` **不会报错**：代码先判 `text`，`text` 有值时只发 `text`，`dsl` 被忽略。

### 请求体（工具实际发送）

```json
{
  "resource_type": "board",
  "src": "画板资源 ID",
  "doc_id": 123456,
  "dsl": { "root": "..." }
}
```

> 传 `text` 时请求体里是 `"text": "..."`（字符串），不发 `dsl`；`src` 一定存在。

### 返回

原样透传上游 JSON（同 `yuque_get_board`）；错误形态同上。

---

## 画板类型说明

| 类型 | 值 | DSL 格式 |
|------|-----|---------|
| 思维导图 | `mindmap` | 缩进文本（Tab/空格缩进表示层级） |
| 流程图 | `flowchart` | Mermaid 语法或语雀自定义 DSL |
| 架构图 | `architecturediagram` | 语雀自定义 DSL（节点 + 连线） |
