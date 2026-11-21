# 语雀 API 错误码

> 所有 API 端点共用以下错误码。当调用失败时，按状态码判断原因并给出对应处理建议。

## 错误码表

| 状态码 | 含义 | 原因 | 处理 |
|--------|------|------|------|
| 400 | 请求参数非法 | 缺少必填参数、参数类型错误、值超出范围 | 检查参数名和值，对照 API 文档修正后重试 |
| 401 | Token/Scope 未通过鉴权 | Token 无效、过期或权限范围不足 | 检查配置里的 `token`（配置文件位置见文末），必要时重新生成 Token |
| 403 | 无操作权限 | 已登录但该操作超出当前用户权限 | 确认操作用户是否有该资源的管理/写入权限 |
| 404 | 实体未找到 | 资源不存在或路径错误（login/slug/id 写错） | 检查 namespace、slug、id 是否正确；确认资源未被删除 |
| 422 | 请求参数校验失败 | 参数语义错误（如重复 key、格式不合法） | 检查参数值是否合法（email、URL 格式等），修正后重试 |
| 429 | 访问频率超限 | 语雀按接口配额限流 | 自动重试（见「重试机制」）。实现不做硬编码的 QPS 判断，只在响应头带 `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `Retry-After` 时把它们拼进错误提示 |
| 500 | 内部错误 | 语雀服务端异常 | 自动重试（见「重试机制」）；持续报错则联系语雀技术支持 |

## 语雀业务错误码

语雀业务错误码通过响应 body 的 `code` 字段返回，常配合 HTTP 状态码出现。关键业务码：

| 业务码 | 含义 | 处理 |
|--------|------|------|
| `invalid_params` | 参数无效 | 按提示检查必填字段与格式 |
| `not_found` | 通用「不存在」 | 核对 id / slug / namespace |
| `user_not_found` | 用户不存在 | 核对 login 或用户 ID |
| `book_not_found` | 知识库不存在 | 核对 book_id 或 namespace |
| `doc_not_found` | 文档不存在 | 核对文档 ID 或 slug |
| `note_not_found` | 小记不存在 | 核对 note_id |
| `group_not_found` | 团队不存在 | 核对团队 login 或 ID |
| `recycle_not_found` | 回收站条目不存在 | 核对 recycle_id |
| `version_not_found` | 文档版本不存在 | 核对版本 ID |
| `toc_not_found` | 目录不存在 | 核对 book_id |
| `permission_denied` | 无操作权限 | 检查 token scope 或团队角色 |
| `membership_required` | 需要对应会员/团队版权益 | 升级权益后重试 |
| `slug_conflict` | 文档 slug 冲突 | 更换 slug 后重试 |
| `book_slug_conflict` | 知识库 slug 冲突 | 更换知识库 slug 后重试 |
| `token_expired` | Token 过期 | 重新生成 Token |
| `token_invalid` | Token 无效 | 核对 token 是否填错、是否被重置 |
| `scope_insufficient` | Token 权限不足 | 补充 scope 权限后重试 |
| `cookie_required` | 需要 Cookie 登录态 | 在配置文件里补 cookie + ctoken（见文末「配置文件位置」） |
| `rate_limit` | 触发限流 | 降低频率后重试 |
| `too_many_requests` | 请求过多 | 退避后重试 |
| `upload_failed` | 上传失败 | 检查文件大小、类型与 cookie/ctoken |
| `body_parse_failed` | 请求体解析失败 | 检查 JSON 格式 |
| `book_full` | 知识库已满（超 5000 节点，语雀 API 对该库不可用） | 换用其他知识库，或拆分为多个知识库 |

上表是有专门文案的业务码全集（`server/src/common/errors.ts` 的 `YUQUE_CODE_MAP`，共 23 个）。未命中的业务码会把响应体里的 `code` 与 `message` 原样拼进错误文本，不会吞掉。

## 结构化错误（非 HTTP 状态码）

除了状态码与业务码，实现还会返回两类结构化错误（都在 `server/src/common/api-client.ts`）：

| 错误码 | 触发条件 | 内容 |
|--------|----------|------|
| `INVALID_RESPONSE` | 响应不是合法 JSON | 附 HTTP status 与响应体前 200 字 |
| `NETWORK_ERROR` | fetch 抛异常（DNS、连接被拒、TLS、超时） | 附原始 `message` 与排查 hint |

两类错误都不重试（`NETWORK_ERROR` 里由超时引起的只在幂等请求上重试，见下节）。

## 危险操作二次确认

删除类工具（`yuque_delete_doc`、`yuque_delete_repo`、`yuque_destroy_recycle` 等）的 `inputSchema` 里带一个必填的 `confirm` 参数，值必须正好是字符串 `DELETE`，否则工具直接返回 isError 提示「危险操作需二次确认」，请求不会发出去（`server/src/common/errors.ts` 的 `confirmationParam` / `checkConfirmation`）。TOC 的 `removeNode` 与 `batch_update_toc` 走同一套确认：前者要 `confirm=DELETE`，后者要 `confirm=RESTRUCTURE`。

## 重试机制（以实现为准）

实现位置：`server/src/common/api-client.ts`。

- **触发条件**：HTTP **429**、HTTP **5xx**，以及**网络异常/请求超时**。注意 5xx/网络异常只对**幂等请求**（GET/HEAD/OPTIONS）生效；POST/PUT/DELETE/PATCH 只在 **429** 重试——重放写请求会重复建文档、重复上传、重复删除（见 `isIdempotent()`）。
- **退避节奏**：指数退避 `1s → 2s → 4s`（`delay = 1000ms × 2^(attempt-1)`）。
- **重试上限**：`MAX_RETRIES = 3`，即最多重试 3 次（含首次共 4 次请求）。
- **单请求超时**：30s（`REQUEST_TIMEOUT = 30_000`）；超时按网络异常处理，同样只对幂等请求重试——写请求超时 30s 后直接报错，不会自动重放。
- **最坏耗时**：仅 GET/HEAD/OPTIONS 成立——约 7s 退避 + 4 次 × 30s 超时窗口 ≈ 2 分钟（网络长时间不通时）；写请求最坏只等 30s。
- 其他状态码（400/401/403/404/422）**不重试**。

## 通用规则

- **401** → 不重试，直接提示用户更新 Token
- **404** → 不重试，确认资源是否存在
- **429** → 自动重试（1s / 2s / 4s，最多 3 次），写请求同样重试。若响应头 `X-RateLimit-Remaining = 0`，说明本小时配额已耗尽，继续重试没有意义，应等下一个配额周期
- **400/422** → 不重试，检查参数后修正
- **500/5xx** → 幂等请求自动重试（1s / 2s / 4s，最多 3 次）；写请求不重试，直接报错
- **网络异常 / 超时** → 只对幂等请求（GET/HEAD/OPTIONS）自动重试；写请求不重试
- **403** → 不重试，确认权限后人工介入

## 配置文件位置

报错文案里统一写「config/config.json」，但实现的实际查找顺序是（`server/src/common/config.ts`）：

1. 命令行 `--config <path>` / `-c <path>` 指定的文件；
2. 当前工作目录的 `yuque-config.json`；
3. `~/.yuque-mcp/config.json`；
4. 开发态回退到仓库内的 `config/config.json`（相对 `server/` 上溯三级）。

照报错文案把文件放在「仓库根/config/config.json」在第 4 步能命中；但装成全局包运行时应优先用 `--config` 显式指定，否则容易落到 cwd 下找不到文件。