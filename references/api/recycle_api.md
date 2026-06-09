# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

### 用户回收站

> ⚠️ **Web API（非 v2 OpenAPI）**：此接口是语雀 Web 端 API，不走 `X-Auth-Token`，需浏览器 Cookie 登录态。从浏览器抓包逆向得出。

#### 获取回收站列表

```http
GET https://www.yuque.com/api/mine/recycles?offset={offset}&limit={limit}&target_type={target_type}
Cookie: {cookie}
x-csrf-token: {ctoken}
Referer: https://www.yuque.com/dashboard/recycles
```

**参数**：

| 参数 | 说明 | 默认 |
|------|------|------|
| `offset` | 分页偏移 | 0 |
| `limit` | 每页条数（≤100） | 50 |
| `target_type` | 筛选类型：`Doc`（文档）/ `Note`（小记）/ `Repo`（知识库） | 不筛选 |

**认证方式**：Cookie 登录态（非 v2 API Token），需从浏览器获取 `_yuque_session` 和 `yuque_ctoken`。

**Headers**：

| Header | 说明 |
|--------|------|
| `Cookie` | 浏览器完整 Cookie 字符串（必须含 `_yuque_session` + `yuque_ctoken`） |
| `x-csrf-token` | 从 Cookie 中提取 `yuque_ctoken` 的值 |
| `Referer` | `https://www.yuque.com/dashboard/recycles`（防盗链） |
| `Accept` | `application/json` |
| `Content-Type` | `application/json` |

**返回 JSON**：

```json
{
  "data": {
    "data": [
      {
        "id": 94982090,
        "target_id": 271116408,
        "target_type": "Doc",
        "book_id": 79349679,
        "created_at": "2026-05-24T09:11:08.000Z",
        "params": {
          "doc": {
            "id": 271116408,
            "title": "文档标题",
            "slug": "abc123"
          },
          "book": {
            "id": 79349679,
            "name": "知识库名称",
            "slug": "book-slug"
          }
        },
        "abilities": {
          "destroy": true
        }
      }
    ],
    "total": 1024
  }
}
```

**返回字段**：

| 字段 | 说明 |
|------|------|
| `id` | 回收站记录 ID（恢复/删除时使用） |
| `target_id` | 原始文档/小记/知识库 ID |
| `target_type` | 类型：`Doc` / `Note` / `Repo` |
| `book_id` | 所属知识库 ID |
| `params.doc.title` | 文档标题（target_type=Doc 时） |
| `params.book.name` | 所属知识库名称 |
| `abilities.destroy` | 是否可彻底删除 |

#### 恢复回收站项目

```http
PUT https://www.yuque.com/api/mine/recycles/{id}/restore
Cookie: {cookie}
x-csrf-token: {ctoken}
Referer: https://www.yuque.com/dashboard/recycles
Content-Type: application/json

{}
```

**参数**：

| 参数 | 说明 |
|------|------|
| `id` | 回收站记录 ID（路径参数，必填） |

**返回**：成功时返回 200，恢复后文档会回到原知识库目录中。

#### 彻底删除回收站项目

> ⚠️ **不可恢复**：此操作会永久删除，请谨慎使用。

```http
DELETE https://www.yuque.com/api/mine/recycles/{id}
Cookie: {cookie}
x-csrf-token: {ctoken}
Referer: https://www.yuque.com/dashboard/recycles
```

**参数**：

| 参数 | 说明 |
|------|------|
| `id` | 回收站记录 ID（路径参数，必填） |

#### 个人写作统计（editor_center）

> ⚠️ **Web API（非 v2 OpenAPI）**：此接口是语雀 Web 端 API，不走 `X-Auth-Token`，需浏览器 Cookie 登录态。来自语雀设置→统计页面抓包逆向。

```http
GET https://www.yuque.com/api/mine/editor_center
Cookie: {cookie}
x-csrf-token: {ctoken}
Referer: https://www.yuque.com/settings/stats
```

**认证方式**：Cookie 登录态（非 v2 API Token）。

**Headers**：

| Header | 说明 |
|--------|------|
| `Cookie` | 浏览器完整 Cookie 字符串 |
| `x-csrf-token` | 从 Cookie 中提取 `yuque_ctoken` 的值 |
| `Referer` | `https://www.yuque.com/settings/stats`（防盗链） |

**返回 JSON**：

```json
{
  "data": {
    "books_count": 350,
    "books_count_30": 42,
    "books_count_365": 68,
    "docs_count": 397529,
    "docs_count_30": 100223,
    "docs_count_365": 211798,
    "docs_public_count": 183,
    "edit_days_all": 1284,
    "edit_days_30": 26,
    "edit_days_365": 320,
    "edit_doc_count_all": 401589,
    "edit_doc_count_30": 100242,
    "edit_doc_count_365": 211773,
    "edit_times_all": 467298,
    "edit_times_30": 110660,
    "edit_times_365": 226925,
    "word_count": 21849134515,
    "word_count_30": 1682832688,
    "word_count_365": 14964374260,
    "max_word_count_book": 4720110755,
    "max_word_count_book_id": 34842241,
    "max_word_book_info": {
      "name": "合集",
      "items_count": 30034
    },
    "liked_count_all": 7357,
    "liked_count_30": 1,
    "liked_count_365": 5,
    "public_doc_likes": 2,
    "interactive_users": [
      {
        "name": "挠挠头",
        "login": "naonaotou-otjdz",
        "avatar_url": "https://cdn.nlark.com/..."
      }
    ],
    "notes_count": 10295,
    "notes_count_30": 37,
    "notes_count_365": 120,
    "days": 1615
  }
}
```

**返回字段**：

| 分类 | 字段 | 说明 |
|------|------|------|
| 知识库 | `books_count` / `_30` / `_365` | 知识库总数 / 30天新增 / 365天新增 |
| 文档 | `docs_count` / `_30` / `_365` | 文档总数 / 30天新增 / 365天新增 |
| 文档 | `docs_public_count` / `_30` / `_365` | 公开文档数 |
| 编辑 | `edit_days_all` / `_30` / `_365` | 有编辑的天数 |
| 编辑 | `edit_doc_count_all` / `_30` / `_365` | 编辑过的文档数 |
| 编辑 | `edit_times_all` / `_30` / `_365` | 编辑次数 |
| 字数 | `word_count` / `_30` / `_365` | 总字数 |
| 字数 | `max_word_count_book` | 最多字数的知识库字数 |
| 字数 | `max_word_book_info` | 最多字数的知识库信息（name/items_count） |
| 社交 | `liked_count_all` / `_30` / `_365` | 获赞数 |
| 社交 | `public_doc_likes` | 公开文档点赞数 |
| 社交 | `interactive_users` | 活跃协作者列表 |
| 小记 | `notes_count` / `_30` / `_365` | 小记数 |
| 账号 | `days` | 注册天数 |

