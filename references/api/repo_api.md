# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 获取知识库列表

```http
GET /api/v2/users/{login}/repos
```

**返回字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int | 知识库 ID |
| `name` | string | 名称 |
| `slug` | string | slug |
| `description` | string | 描述 |
| `public` | int | 0=私有 / 1=公开 / 2=团队内公开 |
| `items_count` | int | 文档数量 |

### 获取知识库详情

```http
GET /api/v2/repos/{id_or_namespace}
```

> `{id_or_namespace}` 支持 book_id（数字）或 namespace（如 `group/book_slug`）。

### 创建知识库

```http
POST /api/v2/users/{login}/repos
Content-Type: application/json

{
  "name": "名称",
  "slug": "repo-slug",
  "description": "描述",
  "public": 0
}
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `name` | 名称（必填） | - |
| `slug` | 路径（必填） | - |
| `description` | 简介 | - |
| `public` | 0=私有 / 1=公开 / 2=团队内公开 | 0 |

⚠️ **slug 必填**：语雀不再自动生成 slug。生成规则：`{拼音缩写}-{时间戳}`，如 `javamst-1714473600`，避免重复。

**slug 格式约束**：仅支持 `[a-z0-9._-]`，大写自动转小写，禁止空格。

### 更新知识库

```http
PUT /api/v2/repos/{id_or_namespace}
Content-Type: application/json

{
  "name": "新名称",
  "description": "新描述",
  "public": 1,
  "toc": "- [文档名](slug)\n  - [子文档](child-slug)"
}
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `name` | 名称 |
| `slug` | 路径 |
| `description` | 简介 |
| `public` | 0=私有 / 1=公开 / 2=团队内公开 |
| `toc` | 目录（Markdown 格式，全量替换）。格式：`[标题](文档slug)`，缩进空格表示层级 |

> 📌 `toc` 用于批量更新目录树，比逐个调目录 API 更高效。

### 删除知识库

> ⚠️ **硬删除**：不可逆，删除知识库会删除其下所有文档。

```http
DELETE /api/v2/repos/{id_or_namespace}
```



