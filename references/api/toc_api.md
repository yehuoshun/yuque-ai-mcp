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