# 语雀回收站 API 参考

> 基地址：`https://www.yuque.com/api/mine/recycles`
> ⚠️ Web API（非 v2 OpenAPI），需要 Cookie 登录态认证。
>
> 凭据来源：`config.json` 的 `cookie`（完整 Cookie 字符串）与 `ctoken`（其中的 `yuque_ctoken` 值）——工具不读环境变量，设 `YUQUE_COOKIE` / `YUQUE_CTOKEN` 不会生效
> 获取方式：浏览器登录 yuque.com → F12 → Application → Cookies → 复制完整 Cookie 字符串，再从中取出 `yuque_ctoken`

## 列出回收站项目

```http
GET /api/mine/recycles?offset={offset}&limit={limit}&target_type={target_type}
```

### 参数

| 参数 | 位置 | 类型 | 说明 | 默认 |
|------|------|------|------|------|
| `offset` | query | int | 分页偏移 | 0 |
| `limit` | query | int | 每页数量 | 50（≤100） |
| `target_type` | query | string | 类型筛选：Doc / Note / Repo | - |

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | int | 总数 |
| `items[].id` | int | 回收站项目 ID |
| `items[].target_id` | int | 原始资源 ID |
| `items[].target_type` | string | Doc / Note / Repo |
| `items[].created_at` | string | 删除时间 |
| `items[].title` | string | 标题 |
| `items[].slug` | string | 路径 |
| `items[].book` | object | 所属知识库（id/name/slug） |

---

## 恢复回收站项目

```http
PUT /api/mine/recycles/{id}/restore
```

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `id` | path | int | 回收站项目 ID（必填）。⚠️ MCP 工具参数名是 `recycle_id` |

### 返回

```json
{"restored": true, "recycle_id": 123}
```

---

## 彻底删除回收站项目

```http
DELETE /api/mine/recycles/{id}
```

> ⚠️ 不可恢复。MCP 工具 `yuque_destroy_recycle` 还要求显式二次确认：必须同时传 `confirm="DELETE"`，否则直接报错不发请求。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `id` | path | int | 回收站项目 ID（必填）。⚠️ MCP 工具参数名是 `recycle_id` |
| `confirm` | tool | string | MCP 工具层必填，值必须是 `DELETE` |

### 返回

```json
{"destroyed": true, "recycle_id": 123}
```