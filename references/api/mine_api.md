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

## 返回格式

### book_stacks

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