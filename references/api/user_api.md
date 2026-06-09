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

### 心跳检测

```http
GET /api/v2/hello
```

**用途**：测试 API Token 是否有效，可用于验证连通性。

**返回结构**：

```json
{
  "data": {
    "message": "string"
  }
}
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `message` | string | 欢迎消息 |

### 获取用户的团队

```http
GET /api/v2/users/{id}/groups?role={role}&offset={offset}
```

**用途**：获取指定用户所属的团队列表。

**参数**：

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `id` | path | string | 用户 login 或 ID（必填） | - |
| `role` | query | int | 角色过滤：0=管理员 / 1=成员 | - |
| `offset` | query | int | 偏移量（分页） | 0 |

> PageSize 固定为 100。

**返回结构**：

```json
{
  "data": {
    "id": 0,
    "type": "Group",
    "login": "string",
    "name": "string",
    "avatar_url": "string",
    "books_count": 0,
    "public_books_count": 0,
    "members_count": 0,
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
| `id` | int | 团队 ID |
| `type` | string | Deprecated，始终为 `Group` |
| `login` | string | 团队 login（路径） |
| `name` | string | 团队名称 |
| `avatar_url` | string | 头像 URL |
| `books_count` | int | 知识库数量 |
| `public_books_count` | int | 公开知识库数量 |
| `members_count` | int | 成员人数 |
| `public` | int | 公开性：0=私密 / 1=公开 / 2=企业内公开 |
| `description` | string | 介绍 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
