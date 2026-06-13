# 语雀 OpenAPI 参考 — 画板资源

> 基地址：`https://www.yuque.com/api/v2`

画板资源（Board）是语雀文档中嵌入的思维导图、流程图、架构图等可视化组件。

---

## 获取画板资源

```http
GET /api/v2/yfm/boards?resource_type=board&src={resource_id}&doc_id={doc_id}
GET /api/v2/yfm/boards?resource_type=board&src={resource_id}&url={doc_url}
```

**用途**：获取文档中指定画板资源的 JSON DSL 和摘要信息。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `resource_type` | query | string | 固定值 `board` |
| `src` | query | string | 画板资源 ID（从 `board://<resource_id>` 提取） |
| `doc_id` | query | int | 文档 ID（与 `url` 二选一） |
| `url` | query | string | 文档 URL（与 `doc_id` 二选一） |

### 返回结构

```json
{
  "data": {
    "id": "画板资源 ID",
    "type": "mindmap | flowchart | architecturediagram",
    "dsl": { /* 画板 DSL 对象 */ },
    "text": "DSL 文本表示",
    "summary": {
      "node_count": 15,
      "edge_count": 14,
      "depth": 3
    }
  }
}
```

---

## 创建画板资源

```http
POST /api/v2/yfm/boards
Content-Type: application/json
```

**用途**：在文档中创建新的画板资源（思维导图/流程图/架构图）。

### 请求体

| 参数 | 类型 | 说明 |
|------|------|------|
| `resource_type` | string | 固定值 `board` |
| `type` | string | 画板类型（必填）：`mindmap`、`flowchart`、`architecturediagram` |
| `dsl` | string | 画板 DSL 文本内容（必填），格式取决于 type |
| `doc_id` | int | 文档 ID（与 `url` 二选一） |
| `url` | string | 文档 URL（与 `doc_id` 二选一） |
| `insert_after_lake_id` | string | 插入到指定 Lake 节点之后，省略则追加到文档末尾 |

### 请求示例

```json
{
  "resource_type": "board",
  "type": "mindmap",
  "dsl": "中心主题\n  分支 A\n    叶子 1\n  分支 B",
  "doc_id": 123456
}
```

---

## 更新画板资源

```http
PUT /api/v2/yfm/boards
Content-Type: application/json
```

**用途**：更新文档中已有的画板资源内容。

### 请求体

| 参数 | 类型 | 说明 |
|------|------|------|
| `resource_type` | string | 固定值 `board` |
| `src` | string | 画板资源 ID（必填，从 `board://<resource_id>` 提取） |
| `text` | string | 新的 DSL 文本内容（与 `dsl` 二选一） |
| `dsl` | object | 新的 JSON DSL 对象（与 `text` 二选一） |
| `doc_id` | int | 文档 ID（与 `url` 二选一） |
| `url` | string | 文档 URL（与 `doc_id` 二选一） |

> ⚠️ `text` 和 `dsl` 二选一，不能同时传。

---

## 画板类型说明

| 类型 | 值 | DSL 格式 |
|------|-----|---------|
| 思维导图 | `mindmap` | 缩进文本（Tab/空格缩进表示层级） |
| 流程图 | `flowchart` | Mermaid 语法或语雀自定义 DSL |
| 架构图 | `architecturediagram` | 语雀自定义 DSL（节点 + 连线） |
