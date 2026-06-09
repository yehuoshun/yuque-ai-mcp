# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

> ⚠️ **未测试**：此模块 API 需要团队/群组环境，当前未实际测试，可能存在问题。如有问题请反馈。

### 列出群组成员

```http
GET /api/v2/groups/{login}/users?offset={offset}&role={role}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `role` | 筛选角色：0=管理员 / 1=成员 / 2=只读（可选） |
| `offset` | 分页偏移，PageSize 固定 100（可选，默认 0） |

**返回 JSON**：`data` 为 `V2GroupUser` 数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 成员记录 ID |
| `group_id` | int | 团队 ID |
| `user_id` | int | 成员用户 ID |
| `role` | int | 角色：0=管理员 / 1=成员 / 2=只读 |
| `user` | object | 用户信息（id/login/name/avatar_url） |
| `group` | object | 团队信息（id/login/name/avatar_url） |
| `created_at` | string | 加入时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |

### 变更成员角色

```http
PUT /api/v2/groups/{login}/users/{id}
Content-Type: application/json

{
  "role": 1
}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `id` | 用户 Login 或 ID（必填） |
| `role` | 0=管理员 / 1=成员（默认） / 2=只读 |

⚠️ 只有群组管理员可以修改成员角色。

**返回 JSON**：`data` 为完整 `V2GroupUser` 对象（含 id/group_id/user_id/role/user/group/created_at/updated_at）。

### 移除群组成员

> ⚠️ **硬删除**：不可逆。

```http
DELETE /api/v2/groups/{login}/users/{id}
```

**参数**：
| 参数 | 说明 |
|------|------|
| `login` | 团队 Login 或 ID（必填） |
| `id` | 用户 Login 或 ID（必填） |

**返回 JSON**：`{ "data": { "user_id": "string" } }`

## 统计 API