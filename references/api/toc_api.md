# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取知识库目录

```http
GET /api/v2/repos/{book_id}/toc
```

等价于 `GET /api/v2/repos/{group_login}/{book_slug}/toc`。

**用途**：获取知识库完整目录树（返回扁平数组，通过 uuid 父子关系导航重建树结构）。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） |

### 返回结构

```json
{
  "data": [
    {
      "uuid": "string",
      "type": "DOC",
      "title": "string",
      "url": "string",
      "slug": "string",
      "id": 0,
      "doc_id": 0,
      "level": 0,
      "depth": 0,
      "open_window": 0,
      "visible": 0,
      "prev_uuid": "string",
      "sibling_uuid": "string",
      "child_uuid": "string",
      "parent_uuid": "string"
    }
  ]
}
```

### 返回字段 (V2TocItem)

| 字段 | 类型 | 说明 |
|------|------|------|
| `uuid` | string | 节点唯一 ID |
| `type` | string | DOC=文档 / LINK=外链 / TITLE=分组标题 |
| `title` | string | 节点名称 |
| `url` | string | 节点 URL |
| `slug` | string | Deprecated，同 url |
| `id` | int | Deprecated，同 doc_id |
| `doc_id` | int | 文档 ID（type=DOC 时） |
| `level` | int | 节点层级（0 起） |
| `depth` | int | Deprecated，同 level |
| `open_window` | int | 0=当前页打开 / 1=新窗口打开 |
| `visible` | int | 0=不可见 / 1=可见 |
| `prev_uuid` | string | 同级前一个节点 uuid |
| `sibling_uuid` | string | 同级后一个节点 uuid |
| `child_uuid` | string | 子级第一个节点 uuid |
| `parent_uuid` | string | 父级节点 uuid，null 为根节点 |

## 更新知识库目录

```http
PUT /api/v2/repos/{book_id}/toc
Content-Type: application/json

{"action":"appendNode","action_mode":"child","type":"DOC","doc_ids":[123]}
```

等价于 `PUT /api/v2/repos/{group_login}/{book_slug}/toc`。

**用途**：创建/移动/编辑/删除目录节点（一个接口覆盖四种操作）。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `book_id` | path | string | 知识库 ID 或 namespace（必填） |
| `action` | body | string | appendNode=尾插 / prependNode=头插 / editNode=编辑 / removeNode=删除（必填） |
| `action_mode` | body | string | sibling=同级 / child=子级（必填） |
| `target_uuid` | body | string | 目标节点 UUID，不填默认根节点 |
| `node_uuid` | body | string | 操作节点 UUID（移动/编辑/删除必填） |
| `type` | body | string | 节点类型：DOC/LINK/TITLE（创建时必填） |
| `doc_ids` | body | [int] | 文档 ID 数组（创建文档时必填） |
| `title` | body | string | 节点名称（创建分组/外链时必填） |
| `url` | body | string | 节点 URL（创建外链时必填） |
| `open_window` | body | int | 0=当前页 / 1=新窗口（外链选填） |
| `visible` | body | int | 0=隐藏 / 1=可见（默认 1） |

### 创建场景参数对应

| 节点类型 | 必填字段 |
|---------|---------|
| DOC（文档） | `type":"DOC"`, `doc_ids` |
| TITLE（分组） | `type":"TITLE"`, `title` |
| LINK（外链） | `type":"LINK"`, `title`, `url` |

### 其他场景

| 操作 | 必填字段 |
|------|---------|
| 移动 | `action=appendNode/prependNode`, `target_uuid`, `node_uuid` |
| 编辑 | `action=editNode`, `node_uuid` |
| 删除（sibling） | `action=removeNode`, `action_mode=sibling`, `node_uuid` |
| 删除（含子节点） | `action=removeNode`, `action_mode=child`, `node_uuid` |

### 返回结构

返回更新后的完整目录，同获取目录返回的 V2TocItem 数组。