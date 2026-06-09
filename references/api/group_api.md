# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取团队成员列表

```http
GET /api/v2/groups/{login}/users?role={role}&offset={offset}
```

**用途**：获取指定团队的所有成员，支持角色过滤和分页。

> ⚠️ 仅此一个 Group 端点可用。获取/创建/更新/删除团队均未开放。

**PageSize 固定为 100**。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 团队 Login 或 ID（必填） | - |
| `role` | query | int | 角色过滤：0=管理员 / 1=成员 / 2=只读成员 | - |
| `offset` | query | int | 偏移量（分页） | 0 |

### 返回结构

```json
{
  "data": [
    {
      "id": 0,
      "group_id": 0,
      "user_id": 0,
      "role": 0,
      "created_at": "2019-08-24T14:15:22Z",
      "updated_at": "2019-08-24T14:15:22Z",
      "group": {
        "id": 0,
        "type": "string",
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
      },
      "user": {
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
  ]
}
```

### 返回字段

#### data[]

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 关联 ID |
| `group_id` | int | 团队 ID |
| `user_id` | int | 成员 ID |
| `role` | int | 角色：0=管理员 / 1=成员 / 2=只读成员 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `group` | object | V2Group，团队信息 |
| `user` | object | V2User，用户信息 |

#### group (V2Group)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 团队 ID |
| `type` | string | Deprecated，始终为 `Group` |
| `login` | string | 路径 |
| `name` | string | 名称 |
| `avatar_url` | string | 头像 |
| `books_count` | int | 知识库数量 |
| `public_books_count` | int | 公开知识库数量 |
| `members_count` | int | 成员人数 |
| `public` | int | 公开性：0=私密 / 1=公开 / 2=企业内公开 |
| `description` | string | 介绍 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |

#### user (V2User)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 用户 ID |
| `type` | string | Deprecated，始终为 `User` |
| `login` | string | 登录名 |
| `name` | string | 昵称 |
| `avatar_url` | string | 头像 |
| `books_count` | int | 知识库数量 |
| `public_books_count` | int | 公开知识库数量 |
| `followers_count` | int | 被关注人数 |
| `following_count` | int | 关注的人数 |
| `public` | int | 公开性：0=私密 / 1=公开 / 2=企业内公开 |
| `description` | string | 介绍 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |