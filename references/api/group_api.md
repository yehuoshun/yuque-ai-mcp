# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取团队成员列表

```http
GET /api/v2/groups/{login}/users?role={role}&offset={offset}
```

**用途**：获取指定团队的所有成员。

> ⚠️ 仅此一个 Group 端点可用。获取/创建/更新/删除团队均未开放。

**PageSize 固定为 100**。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 团队 login（必填） | - |
| `role` | query | int | 角色过滤：0=管理员 / 1=成员 | - |
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
      "created_at": "2022-03-04T02:02:01.000Z",
      "updated_at": "2022-03-04T02:02:01.000Z",
      "user": {
        "id": 0,
        "type": "User",
        "login": "string",
        "name": "string",
        "avatar_url": "string",
        "followers_count": 0,
        "following_count": 0,
        "public": 0,
        "description": "string",
        "created_at": "2022-03-04T02:02:01.000Z",
        "updated_at": "2022-03-04T02:02:01.000Z"
      },
      "group": null,
      "_serializer": "v2.group_user"
    }
  ]
}
```

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 关联 ID |
| `group_id` | int | 团队 ID |
| `user_id` | int | 用户 ID |
| `role` | int | 角色：0=管理员 / 1=成员 |
| `created_at` | string | 加入时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `user` | object | V2User，用户信息 |
| `group` | null | 始终为 null |