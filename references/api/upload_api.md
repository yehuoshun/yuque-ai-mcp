# 语雀文件上传 API 参考

> 基地址：`https://www.yuque.com/api/upload/attach`
> ⚠️ Web API（非 v2 OpenAPI），需要 Cookie 登录态认证。
>
> 配置：`config.json` 中的 `cookie` 和 `ctoken` 字段。
> 获取方式：浏览器登录 yuque.com → F12 → Application → Cookies → 复制 `_yuque_session` 和 `yuque_ctoken`

## 上传文件到 CDN

```http
POST /api/upload/attach?attachable_type=User&attachable_id={user_id}&type={type}&ctoken={ctoken}
Content-Type: multipart/form-data
```

**用途**：上传图片/附件/视频到语雀 CDN，返回 CDN URL。

> ⚠️ 上限 10MB。

### 参数

| 参数 | 位置 | 类型 | 说明 |
|------|------|------|------|
| `attachable_type` | query | string | 固定 `User` |
| `attachable_id` | query | string | 用户 ID |
| `type` | query | string | image / attachment / video |
| `ctoken` | query | string | CSRF Token |
| `file` | body | file | 文件（multipart） |

### 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | string | CDN 地址 |
| `filekey` | string | 文件 key |
| `extname` | string | 扩展名 |