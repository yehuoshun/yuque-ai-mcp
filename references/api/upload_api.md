# 语雀文件上传 API 参考

> 基地址：`https://www.yuque.com/api/upload/attach`
> ⚠️ Web API（非 v2 OpenAPI），需要 Cookie 登录态认证。
>
> 配置：`config.json` 中的 `cookie` 和 `ctoken` 字段。
> 获取方式：浏览器登录 yuque.com → F12 → Application → Cookies → 复制 `_yuque_session` 和 `yuque_ctoken`

## 工具索引

| 工具 | 端点 | 说明 |
|------|------|------|
| `yuque_upload_attachment` | `POST /api/upload/attach` | 上传图片/附件/视频到语雀 CDN，返回 CDN 地址（Cookie 认证） |

---

## yuque_upload_attachment — 上传文件到 CDN

**端点**：

```http
POST /api/upload/attach?attachable_type=User&attachable_id={user_id}&type={type}&ctoken={ctoken}
Content-Type: multipart/form-data（流式构造，零依赖）
```

**用途**：上传图片/附件/视频到语雀 CDN，返回 CDN 地址。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `file_path` | string | ✅ | 本地文件路径（不存在或不可读返回 `FILE_NOT_FOUND`） |
| `type` | string | ❌ | 文件类型：`image` / `attachment` / `video`，默认 `attachment`；未知值按 `attachment` 上限预检，并原样作为 `type` 发给上游 |
| `user_id` | string | ❌ | 用户 ID（`attachable_id`）；省略时自动调 `GET /api/v2/user` 取当前用户 id，取不到时以空串继续上传（通常由上游报错） |

> `attachable_type` 固定为 `User`；`ctoken` 同时作为 query 参数与 `x-csrf-token` 请求头发送，Cookie 请求头取自 `config.json` 的 `cookie`。
> 缺 `cookie` 或 `ctoken` 时直接返回 `MISSING_COOKIE`，不发请求。

### 工具预检（本地拦截，均不发请求）

| 预检 | 触发条件 | 返回 |
|------|---------|------|
| Cookie | 缺 `cookie` / `ctoken` | `MISSING_COOKIE` |
| 扩展名 | 不在白名单（见下节） | `EXT_NOT_ALLOWED` |
| 文件读取 | `stat` 失败（不存在/无权限） | `FILE_NOT_FOUND` |
| 体积 | 超过 `LIMITS` 上限 | `FILE_TOO_LARGE` |

### 大小上限（工具预检 vs 会员额度）

- **工具预检上限**：图片 50MB / 附件 2048MB / 视频 2048MB（`LIMITS`：image 50 / attachment 2048 / video 2048）。
- **实际额度取决于会员等级**：工具不做会员分级预检（代码无 tier 判断），超出会员额度的文件由上游返回错误——`UPLOAD_FAILED`，带 `status` 与 `message`。
- 扩展名白名单之外的格式先打包成 zip 再传（本地直接拒绝，见下节）。

### 返回字段

成功（不带 `isError`）：

```json
{
  "success": true,
  "url": "https://cdn.nlark.com/<filekey>",
  "accessUrl": "https://www.yuque.com/attachments/<filekey>",
  "filekey": "文件 key",
  "extname": "扩展名",
  "type": "image | attachment | video"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 成功固定为 `true`（失败走错误结构，不带该字段） |
| `url` | string | CDN 直链（`cdn.nlark.com/<filekey>`），**无签名 403，不能直接分享**（兼容保留） |
| `accessUrl` | string | **正式可访问地址**（`https://www.yuque.com/attachments/<filekey>`，登录语雀后可下载/分享）；上游未返回时由工具按 `filekey` 拼接 |
| `filekey` | string | 文件 key |
| `extname` | string | 扩展名（取自上游响应，缺失为空串） |
| `type` | string | 回显本次上传的 `type`（默认 `attachment`） |

> ⚠️ **B2（语雀设计，非 bug）**：`accessUrl`（`/attachments/...`）需要登录语雀才能下载——不带 cookie 请求会 302 到登录页。分享给他人时，对方也需登录语雀。

### 错误返回

| `error` | 触发 | 附加字段 |
|---------|------|---------|
| `MISSING_COOKIE` | 缺 cookie / ctoken | `message` |
| `EXT_NOT_ALLOWED` | 扩展名不在白名单 | `file`、`reference` |
| `FILE_NOT_FOUND` | 路径不存在/不可读 | `detail` |
| `FILE_TOO_LARGE` | 超工具预检上限 | `path` |
| `UPLOAD_FAILED` | 上游非 2xx | `status`、`message`（响应体前 200 字符） |
| `UPLOAD_NO_FILEKEY` | 上游 200 但响应里没有 `filekey`（也就拼不出任何可用链接） | `message`（响应体前 200 字符） |
| `UPLOAD_BAD_RESPONSE` | 200 但响应体不是 JSON（典型是 cookie 失效被重定向到 HTML 登录页） | `message` |
| `UPLOAD_TIMEOUT` | 超 25 分钟未完成 | `message` |
| `NETWORK_ERROR` | 网络异常 | `message` |

> 失败自动重试一次（共 2 次尝试），两次都失败才返回最后一个错误。

### 扩展名白名单（本地预检）

> 官方文档：《支持插入的附件格式》https://www.yuque.com/yuque/gpvawt/ca13hg
> 基础格式全体用户可用；会员额外格式需会员（zip/mp4/rar/7z 等）；压缩包家族 zip/gz/rar/7z/tar 单独放行（gz/tar 不在官方清单但实测可传，文档滞后）。

- 上传前本地预检扩展名，白名单外直接返回 `EXT_NOT_ALLOWED`（不浪费网络请求）：
  ```json
  {"error":"EXT_NOT_ALLOWED","message":"语雀不支持 .w3x 扩展名，请打包成 zip 后上传 / ...","file":"t_small.w3x","reference":"https://www.yuque.com/yuque/gpvawt/ca13hg"}
  ```
- 未知/特殊格式（如 .w3x 地图文件）请先打包成 zip 再上传
- **体积实测（v2.15.9+，25min 内部超时 + 流式）**：250MB / 450MB 单次直传均成功（450MB 约 90s，≈5MB/s）；「单次 ~100MB 上限」的旧结论源自当时 30s 内部超时，已作废
- 网络环境差时仍可按 ~90MB 分卷作为兜底（非必需）

### 大文件上传（超时注意事项）

- **MCP 内部上传超时 25 分钟**（`UPLOAD_TIMEOUT_MS`），超时返回 `UPLOAD_TIMEOUT` 结构化错误（不会无限挂起）
- **mcporter 默认 call 超时仅 60s**，大文件上传必须显式加长，否则会被掐断：
  ```bash
  # 单位是毫秒！1800000 = 30 分钟
  mcporter call yuque-mcp.yuque_upload_attachment --args '{"file_path":"/path/to/big.zip"}' --timeout 1800000
  # 或用环境变量（同样毫秒）：
  MCPORTER_CALL_TIMEOUT=1800000 mcporter call ...
  ```
- ⚠️ `--timeout 1800` 会被当作 **1800 毫秒**（1.8 秒）立刻超时——传毫秒数，不是秒
- 超时/失败后 mcporter 下次调用会自动重启 MCP 子进程，无需手动恢复（v0.12 已实测）
- 上传采用**流式 multipart**（零依赖），大文件不整读进内存，无 OOM 风险
