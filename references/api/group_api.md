# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取团队成员列表

```http
GET /api/v2/groups/{login}/users?role={role}&offset={offset}
```

**用途**：获取指定团队的所有成员，支持角色过滤和分页。

> ⚠️ 仅此三个 Group 端点可用。获取/创建/更新/删除团队均未开放。

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

> ⚠️ **上表是上游结构，不是 MCP 工具输出**：`yuque_list_group_users` 默认经 `formatGroupUser` 裁剪成 6 个字段 —— `id`、`login`、`name`、`role`、`avatar_url`、`created_at`（`common/format.ts:354-364`，内部取 `data.user ?? data`，所以 `login`/`name`/`avatar_url` 来自嵌套的 `user` 而不是关联记录）。`group_id`、`user_id`、`updated_at`、`group`、`user` 都**不出现**；需要上游全量请传 `raw: true`。

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

## 变更成员角色

```http
PUT /api/v2/groups/{login}/users/{id}
Content-Type: application/json

{"role": 1}
```

**用途**：修改指定成员在团队中的角色。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 团队 Login 或 ID（必填） | - |
| `id` | path | string | 用户 Login 或 ID（必填） | - |
| `role` | body | int | 角色：0=管理员 / 1=成员 / 2=只读成员 | 1 |

### 返回结构

```json
{
  "data": {
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
}
```

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 关联 ID |
| `group_id` | int | 团队 ID |
| `user_id` | int | 成员 ID |
| `role` | int | 变更后角色：0=管理员 / 1=成员 / 2=只读成员 |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `group` | object | V2Group，团队信息（字段同上） |
| `user` | object | V2User，用户信息（字段同上） |

> 同上：`yuque_update_group_user` 默认也走 `formatGroupUser`，只输出 6 个字段（`id`、`login`、`name`、`role`、`avatar_url`、`created_at`），`related`/`updated_at` 等需 `raw: true`。

## 删除成员

```http
DELETE /api/v2/groups/{login}/users/{id}
```

**用途**：将指定成员移出团队。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `login` | path | string | 团队 Login 或 ID（必填） |
| `id` | path | string | 用户 Login 或 ID（必填） |
| `confirm` | — | string | 危险操作二次确认，工具层必填，值必须是 `DELETE`（`group/delete-user.ts:27`、:38-39 的 `checkConfirmation`），不传直接拦截、不发请求 |

### 返回结构

```json
{
  "data": {
    "user_id": "string"
  }
}
```

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | string | 被删除的用户 ID |

> ⚠️ `yuque_delete_group_user` 默认走 `formatGroupUser`（`group/delete-user.ts:46`），而删除响应里只有 `user_id`，那 6 个字段取不到，序列化后接近空对象 `{}`——**看不到 `user_id`**。要拿上游原样（`{ "data": { "user_id": "…" } }`）请传 `raw: true`；判断是否删除成功以无错误返回为准，不要依赖返回体字段。