# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取小记列表

```http
GET /api/v2/notes?status={status}&page={page}&limit={limit}
```

**用途**：获取当前用户的小记列表（含置顶小记）。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `status` | query | int | 状态过滤：0=正常 / 9=已删除 | - |
| `page` | query | int | 页码 | 1 |
| `limit` | query | int | 每页数量 | 20 |

### 返回结构

```json
{
  "data": {
    "pin_notes": [],
    "notes": [
      {
        "id": 0,
        "slug": "string",
        "content": { "abstract": "string" },
        "word_count": 0,
        "tags": [],
        "created_at": "2019-08-24T14:15:22Z",
        "updated_at": "2019-08-24T14:15:22Z",
        "pinned_at": null,
        "status": 0
      }
    ],
    "has_more": false
  }
}
```

### 返回字段 (列表)

| 字段 | 类型 | 说明 |
|------|------|------|
| `pin_notes` | array | 置顶小记 |
| `notes` | array | 普通小记 |
| `notes[].id` | int | 小记 ID |
| `notes[].slug` | string | 路径 |
| `notes[].content.abstract` | string | 内容摘要 |
| `notes[].word_count` | int | 字数 |
| `notes[].tags` | array | 标签 |
| `notes[].pinned_at` | string | 置顶时间（null 未置顶） |
| `notes[].status` | int | 0=正常 / 9=已删除 |
| `has_more` | bool | 是否有更多（MCP 工具 `yuque_list_notes` 默认裁剪：只返回 `pin_notes` / `notes`，不透出 `has_more` 与 `meta`） |

---

## 获取小记详情

```http
GET /api/v2/notes/{id}
```

**用途**：获取小记完整内容。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `id` | path | int | 小记 ID（必填）。⚠️ MCP 工具参数名是 `note_id`，按 `id` 传会报必填缺失 |

### 返回字段 (详情)

同列表，外加以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `content.source` | string | 纯文本内容 |
| `content.html` | string | HTML 内容 |
| `published_at` | string | 发布时间 (ISO 8601) |
| `likes_count` | int | 点赞数 |
| `comments_count` | int | 评论数 |

> ⚠️ MCP 工具层默认裁剪：`yuque_get_note` 只输出 id/slug/title/content/word_count/public/book_id/created_at/updated_at/note_url，上面三个字段（published_at / likes_count / comments_count）需 `raw: true` 才能看到。

---

## 创建小记

```http
POST /api/v2/notes
Content-Type: application/json

{"body": "内容"}
```

**用途**：创建一条新小记。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `body` | body | string | 小记内容（必填，纯文本或 Markdown） |

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 新小记 ID |
| `slug` | string | 路径 |
| `note_url` | string | 小记链接 |

---

## 更新小记

```http
PUT /api/v2/notes/{id}
Content-Type: application/json

{"body": "新内容"}
```

**用途**：更新小记内容。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `id` | path | int | 小记 ID（必填）。⚠️ MCP 工具参数名是 `note_id` |
| `body` | body | string | 新内容（纯文本或 Markdown）。语法上可省略，但 `status=0`（从已删除恢复）时**必须**传：语雀 PUT /notes 要求 html/source/abstract 必填，软删后原内容已被占位覆盖，工具会直接报「恢复小记需要 body 参数」，不会自动回填 |
| `status` | body | int | 状态：0=正常 / 9=删除 |

### 返回结构

返回更新后的小记详情（同获取详情）。