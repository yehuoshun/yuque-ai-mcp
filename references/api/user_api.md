# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 获取当前 Token 的用户详情

```http
GET /api/v2/user
```

**返回结构**：

```json
{
  "data": {
    "id": 0,
    "type": "string",
    "login": "string",
    "name": "string",
    "avatar_url": "string",
    "books_count": 0,
    "public_books_count": 0,
    "followers_count": 0,
    "following_count": 0,
    "public": 0,
    "description": "string",
    "created_at": "2019-08-24T14:15:22Z",
    "updated_at": "2019-08-24T14:15:22Z"
  }
}
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户 ID |
| `type` | string | Deprecated，始终为 `User` |
| `login` | string | 登录名 |
| `name` | string | 昵称 |
| `avatar_url` | string | 头像 URL |
| `books_count` | int | 知识库数量 |
| `public_books_count` | int | 公开知识库数量 |
| `followers_count` | int | 被关注人数 |
| `following_count` | int | 关注的人数 |
| `public` | int | 公开性：0=私密 / 1=公开 / 2=企业内公开 |
| `description` | string | 介绍 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
