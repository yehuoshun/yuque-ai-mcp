# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 获取小记列表

```http
GET /api/v2/notes?page={page}&limit={limit}&status={status}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `page` | 页码 | 1 |
| `limit` | 每页条数 | 20 |
| `status` | 0=正常 / 9=已删除 | 0（不传也默认正常） |

**返回结构**（`.data` 内）：

```json
{
  "pin_notes": [  /* 置顶小记列表 */ ],
  "notes": [     /* 普通小记列表 */ ],
  "has_more": true
}
```

**小记对象字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 小记 ID |
| `slug` | string | 小记 slug |
| `content` | object | 内容对象，详见下方 |
| `word_count` | int | 字数 |
| `tags` | array | 标签列表 |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |
| `pinned_at` | string/null | 置顶时间（null 表示未置顶） |
| `status` | int | 0=正常 / 9=已删除 |
| `likes_count` | int | 点赞数 |
| `comments_count` | int | 评论数 |

⚠️ **列表 vs 详情的 content 差异**：
- **列表 API**：`content` 只有 `abstract` 和 `updated_at`，**没有 `source` 和 `html`**
- **详情 API**（`GET /notes/{id}`）：`content` 包含完整字段 `{source, html, abstract, format, draft_version, doc_dynamic_data}`

### 获取小记详情

```http
GET /api/v2/notes/{note_id}
```

**返回字段**：同上小记对象。

⚠️ **重要**：`content` 是嵌套对象，结构为：
```json
{
  "content": {
    "source": "纯文本内容",
    "html": "<p>HTML 内容</p>",
    "abstract": "摘要文本（前 200 字左右）",
    "format": "markdown",
    "draft_version": 0,
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

读取小记内容时用 `note.content.source` / `note.content.html` / `note.content.abstract`，不是 `note.content` 直接当字符串。

### 创建小记

```http
POST /api/v2/notes
Content-Type: application/json

{
  "body": "小记内容"
}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `body` | 小记正文内容（必填） |

**返回字段**（`.data` 内）：
| 字段 | 说明 |
|------|------|
| `note_url` | 小记链接 |

⚠️ **实测**：创建小记接口**只返回 `note_url`**，不返回 `id` 和 `slug`。如需获取 id，创建后查小记列表通过 `note_url` 中的 slug 匹配。

### 更新小记

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "新正文（纯文本）",
  "html": "<p>新正文</p>",
  "abstract": "前200字摘要"
}
```

**参数说明**：
| 参数 | 说明 |
|------|------|
| `source` | 纯文本内容（非 Lake 格式也可） |
| `html` | HTML 内容，用 `<p>文本</p>` 包裹 |
| `abstract` | 摘要，取前 200 字 |
| `status` | 可选，9=删除 / 0=恢复 |

**注意**：
- `source` 和 `html` 均非必传 Lake 格式，纯文本包裹 `<p>` 即可正常工作（参考官方 yuque-mcp-server）
- 三个字段不可省略
- 更新后返回完整小记对象（路径 `.data.data`）

### 删除小记

> 💡 **软删除**：小记删除是软删除，移入回收站（status=9），可通过恢复操作还原。

**方法**：先获取小记内容，再 PUT 更新并设置 `status: 9`

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "原文内容",
  "html": "原文HTML",
  "abstract": "原文摘要",
  "status": 9
}
```

**注意**：
- 必须先获取小记原文（包含 source、html、abstract），再软删除
- 删除后进入回收站，可通过设置 `status: 0` 恢复

### 恢复小记

**方法**：先获取小记内容，再 PUT 更新并设置 `status: 0`

```http
PUT /api/v2/notes/{note_id}
Content-Type: application/json

{
  "source": "原文内容",
  "html": "原文HTML",
  "abstract": "原文摘要",
  "status": 0
}
```

将 status 从 9（已删除）改回 0（正常）即可恢复。

## 文档版本 API