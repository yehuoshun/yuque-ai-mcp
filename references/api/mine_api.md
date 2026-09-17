# mine_api

## 概述

`mine` 域提供语雀 Web API（`/api/mine/*`）的调用能力，需要 Cookie 登录态认证（`cookie` + `ctoken`）。

与 v2 OpenAPI（X-Auth-Token 认证）不同，这些端点使用浏览器 Cookie 会话认证。

## 配置

在 `config/config.json` 中配置：

```json
{
  "cookie": "lang=zh-cn; _yuque_session=...; yuque_ctoken=...; tfstk=...",
  "ctoken": "从 Cookie 中提取的 yuque_ctoken 值"
}
```

获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 `_yuque_session` 和 `yuque_ctoken`。

## 端点

| 工具 | 端点 | 说明 |
|------|------|------|
| `yuque_get_book_stacks` | `GET /api/mine/book_stacks` | 获取知识库分组（书架）列表 |
| `yuque_get_editor_center` | `GET /api/mine/editor_center` | 获取个人编辑中心全景数据 |
| `yuque_update_book_stack` | `PUT /api/mine/book_stack/move` | 移动知识库到指定分组（书架） |
| `yuque_sort_book_stack` | `PUT /api/mine/book_stack/move` | 排序分组（书架）内知识库顺序 |

## 返回格式

### book_stacks

`GET /api/mine/book_stacks`

**无参数**。

```json
{
  "stacks": [
    {
      "id": 26776447,
      "name": "分组名称",
      "rank": 0,
      "books": [
        {
          "id": 24255234,
          "type": "Book",
          "slug": "itsn3r",
          "name": "知识库名称",
          "description": "描述",
          "items_count": 100
        }
      ]
    }
  ]
}
```

### editor_center

`GET /api/mine/editor_center`

**无参数**。返回当前用户的编辑中心全景数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| `overview.books` | object | 知识库数：`all`/`last_30d`/`last_365d` |
| `overview.docs` | object | 文档数 |
| `overview.public_docs` | object | 公开文档数 |
| `overview.notes` | object | 小记数 |
| `overview.words` | object | 总字数 |
| `overview.selections` | number | 精选数 |
| `overview.days_since_join` | number | 加入天数 |
| `editing.edit_times` | object | 编辑次数 |
| `editing.edit_days` | object | 编辑天数 |
| `editing.edit_doc_count` | object | 编辑文档数 |
| `engagement.liked` | object | 被点赞数 |
| `engagement.public_likes` | object | 公开文档点赞数 |
| `engagement.interactive_users` | array | 互动用户列表（name/login/avatar_url） |
| `max_word_book` | object | 字数最多的知识库（name/items_count），可能为 null |

```json
{
  "overview": {
    "books": { "all": 50, "last_30d": 2, "last_365d": 10 },
    "docs": { "all": 200, "last_30d": 15, "last_365d": 80 },
    "words": { "all": 150000, "last_30d": 5000, "last_365d": 30000 },
    "days_since_join": 365,
    "selections": 3
  },
  "editing": {
    "edit_times": { "all": 5000, "last_30d": 200, "last_365d": 1500 }
  },
  "engagement": {
    "liked": { "all": 120, "last_30d": 8, "last_365d": 45 },
    "interactive_users": [
      { "name": "用户A", "login": "usera", "avatar_url": "https://..." }
    ]
  },
  "max_word_book": { "name": "我的笔记库", "items_count": 120 }
}
```

### update_book_stack

`PUT /api/mine/book_stack/move`

**用途**：将指定知识库移动到目标分组（书架）下。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `book_id` | number | ✅ | 知识库 ID（数字） |
| `stack_id` | number | ✅ | 目标分组 ID（书架 ID） |

**请求示例**：

```json
{
  "targetStackId": 26776447,
  "targetBookIds": [24255234]
}
```

**返回**：

```json
{
  "success": true,
  "message": "知识库 24255234 已移动到分组 26776447"
}
```

### sort_book_stack

`PUT /api/mine/book_stack/move`（与 update 共用同一端点，传参方式不同）

**用途**：排序分组（书架）内知识库的顺序。语雀无独立排序接口，通过 move 接口传入有序 ID 数组实现，数组顺序即最终 rank。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `stack_id` | number | ✅ | 目标分组 ID（书架 ID） |
| `book_ids` | number[] | ✅ | 排序后的知识库 ID 数组（按期望顺序排列） |

**请求示例**：

```json
{
  "targetStackId": 26776447,
  "targetBookIds": [24255234, 24255235, 24255236]
}
```

**返回**：

```json
{
  "success": true,
  "message": "分组 26776447 内 3 个知识库已按传入顺序排序"
}
```