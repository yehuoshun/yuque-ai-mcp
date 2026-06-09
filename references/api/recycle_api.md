# 语雀回收站 API 参考

> 基地址：`https://www.yuque.com/api/mine/recycles`
> ⚠️ Web API（非 v2 OpenAPI），需要 Cookie 登录态认证。
>
> 环境变量：`YUQUE_COOKIE`（登录 Cookie）、`YUQUE_CTOKEN`（CSRF Token）
> 获取方式：浏览器登录 yuque.com → F12 → Application → Cookies → 复制 `_yuque_session` 和 `yuque_ctoken`

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
| `id` | path | int | 回收站项目 ID（必填） |

### 返回

```json
{"restored": true, "recycle_id": 123}
```

---

## 彻底删除回收站项目

```http
DELETE /api/mine/recycles/{id}
```

> ⚠️ 不可恢复。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `id` | path | int | 回收站项目 ID（必填） |

### 返回

```json
{"destroyed": true, "recycle_id": 123}
```