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

> 单文件上限（专业会员）：图片 20MB / 附件 500MB / 视频 500MB。超级会员：图片 50MB / 附件 2GB / 视频 2GB。

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

### 扩展名白名单（本地预检）

> 官方文档：《支持插入的附件格式》https://www.yuque.com/yuque/gpvawt/ca13hg
> 基础格式全体用户可用；会员额外格式需会员（zip/mp4/rar/7z 等）；压缩包家族 zip/gz/rar/7z/tar 单独放行（gz/tar 不在官方清单但实测可传，文档滞后）。

- 上传前本地预检扩展名，白名单外直接返回 `EXT_NOT_ALLOWED`（不浪费网络请求）：
  ```json
  {"error":"EXT_NOT_ALLOWED","message":"语雀不支持 .w3x 扩展名，请打包成 zip 后上传 / ...","file":"t_small.w3x","reference":"https://www.yuque.com/yuque/gpvawt/ca13hg"}
  ```
- 未知/特殊格式（如 .w3x 地图文件）请先打包成 zip 再上传
- 大小上限（超级会员）：图片 50MB / 附件 2GB / 视频 2GB
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