# 扩展工具 API 参考

> 本章节记录 MCP 封装的扩展工具（非语雀原生 OpenAPI），这些工具基于原生 API 组合实现复杂功能。

---

## 工具索引

| 工具 | 域 | 说明 |
|------|-----|------|
| `yuque_import_file` | doc | 从本地文件导入文档（三种模式） |
| `yuque_import_url` | doc | 从网页 URL 导入文档 |
| `yuque_export_doc` | doc | 导出单篇文档为 Markdown 文件（不含资源下载） |
| `yuque_export_resources` | doc | 下载文档中的图片/附件到本地目录 |
| `yuque_export_repo` | repo | 批量导出知识库为 Markdown |
| `yuque_copy_doc` | doc | 单文档跨知识库复制 |
| `yuque_copy_repo` | repo | 批量跨知识库复制 |
| `yuque_embed_url` | doc | 生成文档嵌入阅读器 URL |
| `yuque_batch_get_docs` | doc | 批量获取文档详情（并发） |
| `yuque_batch_get_repos` | repo | 批量获取知识库详情（并发） |

---

## yuque_import_file — 从本地文件导入

### 端点

`POST /api/v2/repos/:book_id/docs`（内部调用，创建文档）  
`POST /api/upload/attach`（upload_assets 模式，需 Cookie）

### 三种模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `direct` | 原样导入，不处理附件和图片 | 纯 Markdown 文件 |
| `upload_assets` | 本地图片/附件上传到语雀 CDN，替换路径后导入 | 含本地图片的 Markdown |
| `embed_assets` | 附件（docx/xlsx/pptx/pdf）解析内容创建子文档，替换引用为语雀链接 | 含 Office 附件的文档 |

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | ✅ | 本地文件绝对路径（`.md` / `.html`）；文件不存在报 `FILE_NOT_FOUND`，读失败报 `READ_ERROR` |
| `book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `paths` | string[] | ✅ | TOC 目录路径，如 `["收集/技术"]`；1-5 个（超过 5 个截断为前 5 个），空数组报 `INVALID_PATHS`；也接受 JSON 字符串 `"[\"收集/技术\"]"` |
| `mode` | string | ❌ | 导入模式：`direct` / `upload_assets` / `embed_assets`，默认 `direct`；其他取值直接报错 |
| `title` | string | ❌ | 文档标题，默认取文件名去扩展名；都取不到时为 `无标题` |
| `slug` | string | ❌ | 自定义文档 slug，省略则由语雀自动生成 |
| `format` | string | ❌ | 文档格式：`markdown` / `lake` / `html`，默认 `markdown` |

### 返回

```json
{
  "mode": "upload_assets",
  "source_file": "D:/docs/demo.md",
  "title": "demo",
  "book_id": "80346623",
  "paths": ["收集/技术"],
  "assets": {
    "total": 4,
    "uploaded": 3,
    "embedded": 1,
    "failed": 0,
    "details": [
      { "original": "images/a.png", "type": "image", "cdnUrl": "https://cdn.nlark.com/xxx" },
      { "original": "files/spec.pdf", "type": "attachment", "embedDocId": 654321, "embedDocSlug": "spec" }
    ]
  },
  "results": [
    { "path": "收集/技术", "doc_id": 123456, "slug": "abc123" }
  ],
  "total": 1,
  "success": 1,
  "failed": 0
}
```

- 没有顶层 `doc_id` / `slug` / `images_uploaded` / `attachments_embedded` 字段：单篇结果在 `results[]` 里，资源统计在 `assets` 里。
- `results[]` 每个 path 一条，成功含 `doc_id` / `slug`，失败含 `error`；TOC 挂载失败但文档已建时多一个 `warning`。
- `assets.total` 是本地引用总数；`assets.details[]` 逐条给出 `original` / `type`，外加 `cdnUrl`（上传成功）、`embedDocId` + `embedDocSlug`（附件转文档）或 `error`（失败）。
- `upload_assets` 模式缺 Cookie / ctoken 时直接返回 `{ "error": "NO_COOKIE", … }`，不建文档。
- `embed_assets` 的子文档链接按知识库真实 namespace 生成：`https://www.yuque.com/{login 或 group}/{book_slug}/{doc_slug}`（namespace 取自 `GET /repos/{book_id}`）。解析不到 namespace 时**不会**退回用数字 `book_id` 拼链接（那一定是 404），而是正文保留原引用、`assets.details[]` 该条带 `error`，顶层另给一个 `warning`（`doc/import-file.ts:175-191`）。
- `embed_assets` 模式里的图片也会上传到 CDN 并回填 `cdnUrl`（`doc/import-file-utils.ts` 调 `uploadImage`）；缺 Cookie 时该条记 `error`，不会出现「统计 failed=0 但图片仍指向本地路径」。
- 资源处理失败不再一律报 `NO_COOKIE`：只有错误文本含 cookie / ctoken 才是 `NO_COOKIE`，其余（文件不存在、路径越界、格式不支持）按 `ASSET_ERROR` 透传原始错误与 `code`。
- `format` 只接受 `markdown` / `lake` / `html`，其他值直接报 `INVALID_FORMAT`（不会再按 markdown 清洗却以别的格式入库）。

---

## yuque_import_url — 从 URL 导入

### 端点

`POST /api/v2/repos/:book_id/docs`（内部调用）  
`PUT /api/v2/repos/:book_id/toc`（挂载到目录）

### 流程

1. 抓取网页内容 → 清洗为 Markdown
2. 创建文档到目标知识库
3. 挂载到指定 TOC 路径

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `url` | string | ✅ | 网页 URL；抓取失败报 `FETCH_URL_FAILED`（HTTP 非 2xx）/ `FETCH_URL_ERROR`（网络异常） |
| `paths` | string[] | ✅ | TOC 目录路径，1-5 个（超过 5 个截断），空数组报 `INVALID_PATHS` |
| `title` | string | ❌ | 文档标题，默认取网页 `<title>`，取不到时用域名 |
| `format` | string | ❌ | 文档格式：`markdown` / `html`，默认 `markdown` |

### 返回

```json
{
  "source_url": "https://example.com/article",
  "source_title": "页面标题",
  "title": "页面标题",
  "book_id": "80346623",
  "paths": ["收集/技术文章"],
  "results": [
    { "path": "收集/技术文章", "doc_id": 123456, "slug": "abc123" }
  ],
  "total": 1,
  "success": 1,
  "failed": 0
}
```

- `source_title` 是抓取到的网页标题，`title` 是最终落库标题（传了 `title` 则为传入值）。
- 正文末尾会自动追加「原文」链接；`results[]` 失败项带 `error`，TOC 挂载异常带 `warning`。

---

## yuque_export_doc — 导出单篇文档

### 端点

`GET /api/v2/repos/docs/:id`（获取文档内容）

### 职责

取文档 → 转 Markdown → 加 frontmatter → 写磁盘。资源下载已拆分到 `yuque_export_resources`。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 文档 ID 或 slug |
| `book_id` | string | ❌ | 知识库 ID 或 namespace，schema 标注「用 slug 定位文档时推荐填写」（当前实现只按 id 请求，book_id 尚未拼进请求路径） |
| `output_dir` | string | ✅ | 输出目录路径，文件名固定为 `<output_dir>/<标题>.md` |
| `raw_body` | boolean | ❌ | 直接用 body 字段，不做 body_html → Markdown 转换，默认 `false` |

`output_dir` 由 `resolveExportDir()` 校验：入参可传相对或绝对路径，解析后必须等于或位于 `YUQUE_EXPORT_ROOT`（默认 `process.cwd()`）之下，越界返回 `INVALID_OUTPUT_DIR`。返回体里的 `output_dir` / `file` 是**解析后的绝对路径**，与入参写法无关。

### 返回

```json
{
  "status": "done",
  "doc": { "id": "123", "slug": "my-doc", "title": "文档标题", "format": "markdown" },
  "output_dir": "D:/notes/export/my-doc",
  "file": "D:/notes/export/my-doc/文档标题.md",
  "word_count": 1500,
  "note": "图片/附件引用保留原始 URL。如需下载资源，请调用 yuque_export_resources"
}
```

### 与 yuque_export_resources 搭配

```
1. yuque_export_doc → 拿到 .md（图片为 CDN URL）
2. yuque_export_resources → 下载资源到本地
3. Agent 替换 .md 中的 CDN URL 为本地路径
```

---

## yuque_export_resources — 下载文档资源

### 端点

`GET /api/v2/repos/docs/:id`（获取 body_html）

### 职责

解析文档 body_html → 提取图片/附件 → 下载到本地 → 返回 URL→路径映射

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 文档 ID 或 slug |
| `book_id` | string | ❌ | 知识库 ID 或 namespace，schema 标注「用 slug 定位文档时推荐填写」（当前实现只按 id 请求，book_id 尚未拼进请求路径） |
| `output_dir` | string | ✅ | 资源保存目录，资源落到 `<output_dir>/images/` 与 `<output_dir>/attachments/` |

`output_dir` 由 `resolveExportDir()` 校验：入参可传相对或绝对路径，解析后必须等于或位于 `YUQUE_EXPORT_ROOT`（默认 `process.cwd()`）之下，越界返回 `INVALID_OUTPUT_DIR`；返回体里的 `output_dir` / `mapping[].localPath` 是**解析后的绝对路径**。

### 返回

```json
{
  "status": "done",
  "doc": { "id": "123", "title": "文档标题" },
  "output_dir": "D:/notes/export/my-doc",
  "resources_total": 3,
  "downloaded": 2,
  "failed": 1,
  "mapping": [
    { "url": "https://cdn.../img.png", "localPath": "D:/notes/export/my-doc/images/img.png", "type": "image", "success": true }
  ]
}
```

- `mapping[].localPath` 是**绝对落盘路径**（已 join 到 `output_dir` 下），失败项含 `error`；已存在的文件不重复下载，但仍计入 `mapping` 且 `success: true`。
- 文档无 `body_html` 时返回 `{ "status": "skipped", "doc": {…}, "message": "文档无 body_html 内容，无需下载资源", "output_dir": …, "resources": [], "downloaded": 0, "failed": 0 }`，此时没有 `mapping` / `resources_total` 字段。

---

## yuque_export_repo — 批量导出知识库

### 端点

`GET /api/v2/repos/:book_id`（获取知识库信息：slug / name）  
`GET /api/v2/repos/:book_id/toc`（获取 TOC 目录树）  
`GET /api/v2/repos/:book_id/docs`（分页获取文档列表，`offset` + `limit=100`）  
`GET /api/v2/repos/docs/:id`（逐个获取文档内容）

### 流程

1. 获取知识库信息（slug / name）与 TOC 目录树
2. 分页获取全部文档列表（`offset` + `limit=100`，取到不满一页为止）
3. 并发（5）逐个获取文档详情
4. 下载图片/附件，成功的替换为本地相对路径，失败的保留原链接
5. 按 TOC 目录结构落盘 Markdown；同目录同名文档追加 `-<doc_id>` 去重
6. 生成 `INDEX.md`、`GRAPH.md`（已存在且非本工具生成的同名文件会先改名备份）
7. 输出导出报告

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID 或 namespace |
| `output_dir` | string | ❌ | 输出目录，默认 `./yuque-export/<book_slug>`（相对进程 cwd） |
| `download_images` | boolean | ❌ | 是否下载图片/附件，默认 `true` |
| `raw_body` | boolean | ❌ | 直接用 body 字段，不做 body_html → Markdown 转换，默认 `false` |

`output_dir` 由 `resolveExportDir()` 校验：入参可传相对或绝对路径，解析后必须位于 `YUQUE_EXPORT_ROOT`（默认 `process.cwd()`）之下，越界返回 `INVALID_OUTPUT_DIR`；返回体里的 `output_dir` / `index_file` / `graph_file` / `files[].file` 都是**解析后的绝对路径**。默认值里的 `<book_slug>` 取知识库 `slug`，取不到时用 `book_id` 把 `/` 换成 `_`。

### 返回

```json
{
  "status": "done",
  "repo": { "id": "80346623", "slug": "ns", "name": "知识库名称" },
  "output_dir": "D:/notes/yuque-export/ns",
  "summary": {
    "total_docs": 50,
    "ok": 50,
    "error": 0,
    "images_downloaded": 120,
    "images_failed": 3
  },
  "index_file": "D:/notes/yuque-export/ns/INDEX.md",
  "graph_file": "D:/notes/yuque-export/ns/GRAPH.md",
  "files": [
    {
      "doc_id": 123,
      "slug": "abc",
      "title": "文档标题",
      "status": "ok",
      "file": "D:/notes/yuque-export/ns/收集/技术/文档标题.md",
      "dir": "收集/技术",
      "images_downloaded": 3,
      "images_failed": 0,
      "outboundLinks": ["https://www.yuque.com/group/ns/def"]
    }
  ]
}
```

- 知识库无文档时返回 `{ "status": "empty", "message": "知识库 \"…\" 没有文档" }`，不写任何文件。
- `files[]` 逐篇给出 `status`（`ok` / `error`）、`file`、`dir`（TOC 目录，根目录下为空串）、`images_downloaded` / `images_failed`、`outboundLinks`；失败项带 `error`，且 `file` / `dir` 为空串。

---

## yuque_copy_doc — 单文档跨库复制

### 端点

`POST /api/v2/repos/:book_id/docs`（创建目标文档）  
`PUT /api/v2/repos/:book_id/toc`（挂载到目录）

### 流程

Agent 通过 `yuque_get_doc` 拉取源文档 → 清洗内容 → 调用本工具创建副本。

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target_book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `title` | string | ✅ | 文档标题 |
| `body` | string | ✅ | 文档内容（Agent 清洗后） |
| `format` | string | ✅ | 格式：`markdown` / `lake` / `html` |
| `paths` | string[] | ✅ | 目录路径数组，1-5 个（超过 5 个截断）；空数组报 `INVALID_PATHS`；也接受 JSON 字符串 |
| `source_url` | string | ❌ | 源文档 URL，追尾为脚注链接 |
| `source_title` | string | ❌ | 源文档标题，用于脚注 |

### 返回

```json
{
  "title": "文档标题",
  "target_book_id": "80346623",
  "paths": ["Java/Spring"],
  "results": [
    { "path": "Java/Spring", "doc_id": 123456, "slug": "abc123" }
  ],
  "total": 1,
  "success": 1,
  "failed": 0
}
```

---

## yuque_copy_repo — 批量跨库复制

### 端点

`GET /api/v2/repos/:book_id/docs`（获取源库文档列表）  
`POST /api/v2/repos/:book_id/docs`（逐篇创建）  
`PUT /api/v2/repos/:book_id/toc`（逐篇挂载）

### 流程

1. Agent 分析源库文档，决定分类和清洗规则
2. Agent 传入 `documents` JSON 数组（含 title/body/paths）
3. 工具批量创建文档并挂载到 TOC

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target_book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `documents` | string | ✅ | JSON 数组（也接受数组类型），每个元素含 `title`/`body`/`format`/`paths`，可选 `source_url`/`source_title`（追尾为脚注链接）；空数组报 `INVALID_DOCUMENTS`；每个元素的 `paths` 超过 5 个截断 |
| `raw` | boolean | ❌ | schema 已声明，但当前 handler 未读取该参数，固定返回下面的精简结构 |

### 返回

```json
{
  "target_book_id": "80346623",
  "total_docs": 10,
  "total_copies": 10,
  "total_failed": 0,
  "details": [
    {
      "title": "文档1",
      "paths": ["分类A"],
      "results": [
        { "path": "分类A", "doc_id": 123456, "slug": "abc123" }
      ]
    }
  ]
}
```

- `total_copies` / `total_failed` 按「文档 × path」逐条计数：同一篇文档复制到 2 个目录记为 2 次。
- `details[].results[]` 失败项带 `error`，TOC 挂载异常带 `warning`；元素的 `paths` 为空时该条 results 为 `[{ "path": "", "error": "paths 为空" }]`。

---

## yuque_embed_url — 嵌入阅读器 URL

### 端点

无（纯工具函数，基于语雀嵌入文档阅读器规范）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from` | string | ✅ | 调用方应用名，拼进 URL 的 `from` 参数；缺失报 `from is required` |
| `url` | string | ❌ | 语雀文档完整 URL（与 doc_id + book_id 二选一）；原有 query 会被清空后重新拼接 |
| `doc_id` | string | ❌ | 文档 ID（需配合 book_id） |
| `book_id` | string | ❌ | 知识库 ID 或 namespace（如 `yuque/developer`），与 doc_id 搭配使用 |
| `title` | number | ❌ | 是否显示标题：1=显示，0=隐藏；不传按语雀默认（显示） |
| `outline` | number | ❌ | 是否显示大纲侧栏：1=显示，0=隐藏；不传按语雀默认（显示） |
| `translate` | string | ❌ | 翻译语种：`en`/`zh`/`ru`/`pt`/`es`/`fr`/`ja`/`ar`/`de`/`it`/`ko`/`tr`/`vi`/`pl`/`he`/`id`/`hi`/`nl`/`th` |

`url` 与 `doc_id` + `book_id` 都没给时直接返回错误（`isError: true`）：`{ "error": "请提供 url 或 (doc_id + book_id) ...", "usage": { "url": "…", "from": "your_appname" } }`。

### 返回

```json
{
  "embed_url": "https://www.yuque.com/yuque/developer/embed?view=doc_embed&from=myapp",
  "iframe_code": "<iframe src=\"https://www.yuque.com/yuque/developer/embed?view=doc_embed&from=myapp\" width=\"100%\" height=\"600\" frameborder=\"0\"></iframe>",
  "params": {
    "view": "doc_embed",
    "from": "myapp",
    "title": "默认（显示）",
    "outline": "默认（显示）",
    "translate": "无"
  },
  "note": "嵌入模式仅支持公开文档，私密文档请通过 API 获取内容后自行渲染 / Embed mode only supports public documents. For private docs, fetch content via API and render yourself.",
  "supported_languages": { "en": "英语", "zh": "中文", "ru": "俄罗斯语" }
}
```

`embed_url` 固定为 `<文档地址>?view=doc_embed&from=<from>`（`title` / `outline` / `translate` 传了才追加）；`params` 里未传的项显示为 `默认（显示）` 或 `无`，`supported_languages` 列出全部 19 个语种（`doc/embed-url.ts:127-147` 的映射只有 19 个键，同文前面列的 19 个语种是对的）。

---

## yuque_batch_get_docs — 批量获取文档

### 端点

`GET /api/v2/repos/:book_id/docs/:id?raw=1|0`（并发 N 个请求，`raw` 走 URL query，取值 `1` / `0`）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID 或 namespace（所有文档共用） |
| `ids` | array | ✅ | 文档 ID / slug 数组，如 `[123,456]` 或 `["slug-a"]`；最多 20 个，空数组或超过 20 个直接报错；也接受 JSON 字符串 |
| `raw` | boolean | ❌ | 返回原始全量 JSON（默认 false，返回 `formatDoc` 精简字段） |

### 返回

```json
{
  "total": 5,
  "ok": 4,
  "docs": {
    "123": { "id": 123, "slug": "doc-1", "title": "文档1", "type": "Doc", "format": "markdown", "public": 1, "word_count": 1500, "body": "...", "body_html": "...", "book_id": 80346623, "updated_at": "2026-01-01T00:00:00.000Z" }
  },
  "errors": [
    { "id": "missing-doc", "detail": { "…": "上游错误原文" } }
  ]
}
```

- `docs` 仅在至少 1 篇成功时出现：以请求里传入的 id（字符串化）为 key 的对象，**不是数组**；`errors` 仅在有条目失败时出现，`errors[].detail` 是上游原始错误对象。
- 没有 `success` / `failed` 字段，`ok` 即成功篇数；`docs` 各 value 是 `formatDoc` 结果的对象（`doc/batch-get-docs.ts` 已把 `wrapResult` 序列化出的字符串 parse 回对象，**客户端直接取字段即可，不用再 parse**）。

---

## yuque_batch_get_repos — 批量获取知识库

### 端点

`GET /api/v2/repos/:id`（并发 N 个请求）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ids` | array | ✅ | 知识库 ID / namespace 数组，如 `[123]` 或 `["group/repo-a"]`；最多 20 个，空数组或超过 20 个直接报错；也接受 JSON 字符串 |

### 返回

```json
{
  "total": 3,
  "ok": 3,
  "repos": {
    "456": { "id": 456, "slug": "ns1", "name": "知识库1", "namespace": "group/ns1", "public": 1, "items_count": 10, "likes_count": 2, "user_id": 1, "created_at": "…", "updated_at": "…" }
  }
}
```

- `repos` 仅在至少 1 个成功时出现：以请求里传入的 id（字符串化）为 key 的对象，**不是数组**；有条目失败时多一个 `errors: [{ id, detail }]`。
- 没有 `success` / `failed` 字段，`ok` 即成功个数；本工具无 `type` / `raw` 参数，固定返回 `formatRepo` 精简字段。
- `repos` 各 value 是 `formatRepo` 结果的对象（`repo/batch-get-repos.ts` 已 parse 回对象，**客户端不用再 parse**）。

---

## 错误处理

所有扩展工具共用 `references/api/errors.md` 中的错误码体系。网络异常、Token 过期、限流等错误会以统一格式返回。

