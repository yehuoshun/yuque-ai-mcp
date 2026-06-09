# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

## 获取知识库列表

```http
GET /api/v2/users/{login}/repos?type={type}&offset={offset}&limit={limit}
GET /api/v2/groups/{login}/repos?type={type}&offset={offset}&limit={limit}
```

**用途**：获取用户或团队下的知识库列表，支持类型过滤和权限过滤。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 用户/团队的 Login 或 ID（必填） | - |
| `type` | query | string | 类型过滤：Book（文档型）/ Design（画板型） | - |
| `offset` | query | int | 偏移量（分页） | 0 |
| `limit` | query | int | 每页数量 | 100（≤100） |
| `filterByAbility` | query | string | 权限过滤：`create_doc`（仅返回有创建文档权限的知识库） | - |

### 返回结构

```json
{
  "data": [
    {
      "id": 0,
      "type": "string",
      "slug": "string",
      "name": "string",
      "user_id": 0,
      "description": "string",
      "creator_id": 0,
      "public": 0,
      "items_count": 0,
      "likes_count": 0,
      "watches_count": 0,
      "content_updated_at": "2019-08-24T14:15:22Z",
      "created_at": "2019-08-24T14:15:22Z",
      "updated_at": "2019-08-24T14:15:22Z",
      "user": {},
      "namespace": "string"
    }
  ]
}
```

### 返回字段 (V2Book)

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `type` | string | 类型：Book/Design/Sheet/Resource |
| `slug` | string | 路径 |
| `name` | string | 名称 |
| `user_id` | int | 归属用户/团队 ID |
| `description` | string | 简介 |
| `creator_id` | int | 创建者 ID |
| `public` | int | 0=私密 / 1=公开 / 2=企业内公开 |
| `items_count` | int | 文档数量 |
| `likes_count` | int | 点赞数 |
| `watches_count` | int | 订阅数 |
| `content_updated_at` | string | META 更新时间 (ISO 8601) |
| `created_at` | string | 创建时间 (ISO 8601) |
| `updated_at` | string | 更新时间 (ISO 8601) |
| `user` | object | V2User，创建者 |
| `namespace` | string | 完整路径 |

## 创建知识库

```http
POST /api/v2/users/{login}/repos
POST /api/v2/groups/{login}/repos
Content-Type: application/json

{"name": "名称", "slug": "路径", "public": 0}
```

**用途**：在用户或团队下创建新知识库。

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `login` | path | string | 用户/团队的 Login 或 ID（必填） | - |
| `name` | body | string | 知识库名称（必填） | - |
| `slug` | body | string | 知识库路径（必填） | - |
| `description` | body | string | 简介 | - |
| `public` | body | int | 0=私密 / 1=公开 / 2=企业内公开 | 0 |
| `enhancedPrivacy` | body | bool | 增强私密性：非管理员成员也设为无权限 | - |

### 返回结构

返回 V2Book（字段同获取列表）。