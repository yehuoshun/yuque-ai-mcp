# 语雀 OpenAPI 参考

> 基地址：`https://www.yuque.com/api/v2`

> ⚠️ **非 v2 OpenAPI**：此接口是语雀 Web 端上传接口，不走 `X-Auth-Token`，需浏览器 Cookie 登录态。从浏览器抓包逆向得出。

### 上传文件到 CDN

```http
POST https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id={userId}&type={type}&ctoken={ctoken}
Cookie: {cookie}
x-csrf-token: {ctoken}
Referer: https://www.yuque.com/
Origin: https://www.yuque.com
Content-Type: multipart/form-data; boundary=----xxx

------xxx
Content-Disposition: form-data; name="file"; filename="{fileName}"
Content-Type: application/octet-stream

{文件二进制内容}
------xxx--
```

**URL 参数**：

| 参数 | 说明 |
|------|------|
| `attachable_type` | 固定 `User` |
| `attachable_id` | 用户 ID（从 `GET /api/v2/user` 获取） |
| `type` | `image`（图片）/ `attachment`（附件）/ `video`（视频） |
| `ctoken` | CSRF Token，从 Cookie 中提取 `yuque_ctoken` 的值 |

**Headers**：

| Header | 说明 |
|--------|------|
| `Cookie` | 浏览器完整 Cookie 字符串（必须含 `_yuque_session` + `yuque_ctoken`） |
| `x-csrf-token` | 同 `ctoken` 参数，CSRF 校验用 |
| `Referer` | `https://www.yuque.com/`（防盗链） |
| `Origin` | `https://www.yuque.com/`（防盗链） |
| `User-Agent` | 模拟浏览器 UA |

**Body**：`multipart/form-data`，单个 `file` 字段为文件二进制。

**认证方式**：Cookie 登录态（非 v2 API Token），需从浏览器获取 `_yuque_session` 和 `yuque_ctoken`。Cookie 会过期，过期后需重新获取。

**返回**：

```json
{
  "data": {
    "filekey": "yuque/0/2025/xxx/xxx.png"
  }
}
```

| 字段 | 说明 |
|------|------|
| `data.filekey` | 文件在 CDN 的唯一标识 |

**CDN URL 拼接**：`https://cdn.nlark.com/{filekey}`

### 上传限制

> ⚠️ 以下为**专业会员**及以上等级的上传限制（最低权限要求）。普通会员限制更低，不适用。

| 类型 | type 值 | 专业会员 | 超级会员 |
|------|---------|---------|---------|
| 图片 | `image` | 20 MB | 50 MB |
| 附件 | `attachment` | 500 MB | 1 GB |
| 视频 | `video` | 500 MB | 1 GB |

## 群组成员 API