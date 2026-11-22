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
| `yuque_get_editor_center` | `GET /api/mine/editor_center` | 获取个人编辑中心全景数据 |
| `yuque_update_book_stack` | `PUT /api/mine/book_stack/move` | 移动知识库到指定分组（书架） |
| `yuque_sort_book_stack` | `PUT /api/mine/book_stack/move` | 排序分组（书架）内知识库顺序 |
| `yuque_create_book_stack` | `POST /api/mine/book_stack` + `PUT /api/book_stacks/{id}` | 创建分组（create 后自动改名） |
| `yuque_rename_book_stack` | `PUT /api/book_stacks/{id}` | 重命名分组（书架） |
| `yuque_delete_book_stack` | `DELETE /api/book_stacks/{id}` | 删除分组（书架） |

## 返回格式

### book_stacks

`GET /api/mine/book_stacks`

**无参数**。

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

> ⚠️ **单个分组最多只返回 200 个知识库（响应窗口，不是容量上限）**：`books` 数组在语雀服务端被截到 200 个，超出部分不返回、网页端侧栏同样看不到，补 `limit` / `page` / `per_page` 参数都不改变结果。实测 2026-11-22：分组「编程技术」真实 426 个库（账号全站 789 个库）却恒回 200 个；移走库后窗口自动补位、删库后先前被挤出的库自动回到列表 —— 是滑动窗口，不是硬容量。
>
> **拿全量组内清单不能靠 `GET /api/books?stack_id=<stack_id>`**：该参数实测被忽略（照样返回全站 789 条），且 `/api/books` 的 `stack_id` 字段陈旧（645/789 为 null），不能用来判归属。可行做法是把分组拆到 200 以内后逐组读；`yuque_get_book_stacks` 在某个分组正好返回 200 个时会额外给出 `warnings` + `possibly_truncated`，提示该组可能还有看不到的库。

### editor_center

`GET /api/mine/editor_center`

**无参数**。返回当前用户的编辑中心全景数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| `overview.books` | object | 知识库数：`all`/`last_30d`/`last_365d` |
| `overview.docs` | object | 文档数 |
| `overview.public_docs` | object | 公开文档数 |
| `overview.notes` | object | 小记数 |
| `overview.words` | object | 总字数 |
| `overview.selections` | number | 精选数 |
| `overview.days_since_join` | number | 加入天数 |
| `editing.edit_times` | object | 编辑次数 |
| `editing.edit_days` | object | 编辑天数 |
| `editing.edit_doc_count` | object | 编辑文档数 |
| `engagement.liked` | object | 被点赞数 |
| `engagement.public_likes` | object | 公开文档点赞数 |
| `engagement.interactive_users` | array | 互动用户列表（name/login/avatar_url） |
| `max_word_book` | object | 字数最多的知识库（name/items_count），可能为 null |

```json
{
  "overview": {
    "books": { "all": 50, "last_30d": 2, "last_365d": 10 },
    "docs": { "all": 200, "last_30d": 15, "last_365d": 80 },
    "words": { "all": 150000, "last_30d": 5000, "last_365d": 30000 },
    "days_since_join": 365,
    "selections": 3
  },
  "editing": {
    "edit_times": { "all": 5000, "last_30d": 200, "last_365d": 1500 }
  },
  "engagement": {
    "liked": { "all": 120, "last_30d": 8, "last_365d": 45 },
    "interactive_users": [
      { "name": "用户A", "login": "usera", "avatar_url": "https://..." }
    ]
  },
  "max_word_book": { "name": "我的笔记库", "items_count": 120 }
}
```

### update_book_stack

`PUT /api/mine/book_stack/move`

**用途**：将指定知识库移动到目标分组（书架）下。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `book_id` | number | ✅ | 知识库 ID（数字） |
| `stack_id` | number | ✅ | 目标分组 ID（书架 ID） |

**请求示例**：

```json
{
  "targetStackId": 26776447,
  "targetBookIds": [24255234]
}
```

**返回**：

```json
{
  "success": true,
  "message": "知识库 24255234 已移动到分组 26776447"
}
```

**行为与校验**：`PUT /api/mine/book_stack/move` **成功和失败都返回 HTTP 200 + `{}`**，从响应体判断不出真实结果。所以工具在请求之后回查 `GET /api/mine/book_stacks`，**轮询 3 次、每次间隔 1500ms**，确认该知识库的 `id` 出现在 `stack_id` 分组的 `books` 里才返回 `success: true`（`mine/update-book-stack.ts:61-88`）。

> 3 次仍未命中则返回 `isError`，文本为：`移动失败：知识库 {book_id} 未出现在分组 {stack_id}（已重试 3 次）`（`mine/update-book-stack.ts:90-98`）。注意失败文案不区分「上游真的没动」和「上游动了但回查时还没生效」，看到它先手工确认分组，再决定是否重发。
>
> ⚠️ **目标分组已有 ≥200 个知识库时，回查会误报失败**：回查用的是 `book_stacks`，而它对该分组只返回前 200 个（见上文上限说明）；移进去的知识库排在 200 名之后时回查看不到，于是「移动其实成功、工具却报失败」。**无法用接口直接核对**（`GET /api/books?stack_id=` 的筛选参数被忽略、`stack_id` 字段陈旧）：先看该库是否出现在某个分组的返回窗口里，实在要确认就在网页端瞄一眼分组；根本的解法是把目标分组控制在 200 个以内，别往窗口已满的分组里搬。

### sort_book_stack

`PUT /api/mine/book_stack/move`（与 update 共用同一端点，传参方式不同）

**用途**：排序分组（书架）内知识库的顺序。语雀无独立排序接口，通过 move 接口传入有序 ID 数组实现，数组顺序即最终 rank。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `stack_id` | number | ✅ | 目标分组 ID（书架 ID） |
| `book_ids` | number[] | ✅ | 排序后的知识库 ID 数组（按期望顺序排列） |

**请求示例**：

```json
{
  "targetStackId": 26776447,
  "targetBookIds": [24255234, 24255235, 24255236]
}
```

**返回**：

```json
{
  "success": true,
  "message": "分组 26776447 内 3 个知识库已按传入顺序排序"
}
```

**行为与校验**：与 `update_book_stack` 同一端点，同样**200 + `{}` 假成功**；工具回查 `GET /api/mine/book_stacks`，轮询 3 次、每次间隔 1500ms（`mine/sort-book-stack.ts:62-94`）。

> ⚠️ **排序同样受 200 上限约束**：`book_ids` 里只要有一个知识库落在该分组返回窗口（前 200 个）之外，回查就会判「成员不齐」并报 `移动失败：…缺少部分知识库…`（见上文 book_stacks 上限说明）。分组接近或超过 200 个知识库时，别只信工具回执：`book_ids` 里排在窗口外的库回查根本看不到，判断会失真；接口也没有别的通道能核对（`stack_id` 过滤被忽略），只能先在网页端确认，或先把分组拆到 200 以内再排序。
>
> ✅ **回查同时校验成员与顺序**：先判成员是否齐全（`mine/sort-book-stack.ts:72-74` 的 `got` 与 `bookIds.every((id) => got.has(id))`），齐了再把每个 `book_id` 在分组 `books` 数组里的下标取出来逐个比较（`mine/sort-book-stack.ts:75-76` 的 `positions` / `inOrder`）——下标必须严格递增，顺序不符就不返回成功。

> 两类失败都返回 `isError`，分别对应两种文本：
> - 成员不齐：`移动失败：分组 {stack_id} 内缺少部分知识库（已重试 3 次），缺失: {id, id}`（`mine/sort-book-stack.ts:96-98`）；
> - 成员齐但顺序不符：`排序未生效：分组 {stack_id} 内成员都在，但顺序与传入不一致；实际顺序: {id, id}（move 接口只回 200，需上游支持排序）`（`mine/sort-book-stack.ts:97-99`），文案自带实际顺序，便于判断是上游完全不排序还是只排了一部分。

### create_book_stack

`POST /api/mine/book_stack`（创建）+ `PUT /api/book_stacks/{stack_id}`（改名）

**用途**：创建知识库分组（书架）。

⚠️ 语雀 create 接口**无法指定名称**，只会生成默认名「新建分组」；想命名必须在 create 之后用 edit(PUT) 改名。本工具内部已自动补一次改名，使 `name` 生效。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `name` | string | ✅ | 分组名称 |
| `target_rank` | number | ❌ | 目标排序位（默认 0） |

**请求示例**：

```json
{ "name": "我的分组", "target_rank": 0 }
```

**返回**：

```json
{
  "success": true,
  "stack_id": 57039609,
  "name": "我的分组",
  "renamed": true,
  "created_raw": { "data": { "id": 57039609, "name": "新建分组" } }
}
```

| 字段 | 说明 |
|------|------|
| `success` | create 请求本身失败会直接透传错误、不返回本结构，所以拿到本结构时恒为 `true` |
| `stack_id` | 新建分组 ID；create 响应里没有 `data.id` 时为 `null` |
| `name` | 传入的名称 |
| `renamed` | 自动改名是否成功；`false` 说明分组仍叫默认名「新建分组」 |
| `rename_warning` | **仅改名失败时出现**，固定文案「创建成功但改名失败」 |
| `rename_error` | **仅改名失败时出现**，改名请求的原始错误对象 |
| `created_raw` | create 接口的原始返回；`stack_id` 为 `null` 时据此排查上游到底给了什么 |

依据：`mine/create-book-stack.ts:67-85`（`stack_id: stackId ?? null`、`renamed`、`...(renameError ? { rename_warning, rename_error } : {})`、`created_raw: created`）。

### rename_book_stack

`PUT /api/book_stacks/{stack_id}`

**用途**：重命名知识库分组（书架）。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `stack_id` | number | ✅ | 分组 ID（书架 ID） |
| `name` | string | ✅ | 新名称 |

**请求示例**（body）：

```json
{ "name": "新名字", "type": "user_books" }
```

**返回**：

```json
{
  "success": true,
  "message": "分组 57039609 已重命名为「新名字」",
  "raw": {}
}
```

> `raw` 是 `PUT /api/book_stacks/{stack_id}` 的原始返回，实测通常是空对象 `{}`，**不能**据此判断是否真的改名成功（该接口同样没有可靠回执）。依据：`mine/rename-book-stack.ts:54-64`。

### delete_book_stack

`DELETE /api/book_stacks/{stack_id}`

**用途**：删除知识库分组（书架）。

⚠️ **删除不可恢复**。分组内若还有知识库，需先用 `update_book_stack` 移走再删。

**参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `stack_id` | number | ✅ | 要删除的分组 ID（书架 ID） |
| `confirm` | string | ✅ | 危险操作二次确认，必须传 `'DELETE'` |

**请求示例**（body）：

```json
{ "type": "user_books" }
```

**返回**（删除后回查确认分组已消失）：

```json
{ "success": true, "message": "分组 57039609 已删除" }
```