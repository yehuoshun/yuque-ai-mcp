# 扩展工具 API 参考

> 本章节记录 MCP 封装的扩展工具（非语雀原生 OpenAPI），这些工具基于原生 API 组合实现复杂功能。

---

## 工具索引

| 工具 | 域 | 说明 |
|------|-----|------|
| `yuque_import_file` | doc | 从本地文件导入文档（三种模式） |
| `yuque_import_url` | doc | 从网页 URL 导入文档 |
| `yuque_export_doc` | doc | 导出单篇文档为 Markdown |
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
| `book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `file_path` | string | ✅ | 本地文件绝对路径 |
| `mode` | string | ❌ | 导入模式：`direct` / `upload_assets` / `embed_assets`，默认 `direct` |
| `paths` | string | ❌ | JSON 数组，TOC 目录路径，如 `["收集/技术"]` |
| `public` | number | ❌ | 可见性：0=私密，1=公开，2=团队内公开 |
| `slug` | string | ❌ | 自定义文档 slug |
| `format` | string | ❌ | 文档格式：`markdown` / `lake` / `html`，默认 markdown |

### 返回

```json
{
  "doc_id": 123456,
  "title": "文档标题",
  "slug": "slug",
  "mode": "upload_assets",
  "images_uploaded": 3,
  "images_failed": 0,
  "attachments_embedded": 1,
  "path": "收集/技术"
}
```

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
| `url` | string | ✅ | 网页 URL |
| `paths` | string | ✅ | JSON 数组，1-5 个目录路径 |
| `public` | number | ❌ | 可见性，默认继承知识库设置 |
| `format` | string | ❌ | 文档格式，默认 `markdown` |

### 返回

```json
{
  "doc_id": 123456,
  "title": "页面标题",
  "url": "https://example.com/article",
  "path": "收集/技术文章"
}
```

---

## yuque_export_doc — 导出单篇文档

### 端点

`GET /api/v2/repos/docs/:id`（获取文档内容）

### 流程

1. 获取文档详情（body + body_html）
2. 解析 body_html 中的图片/附件
3. 下载图片/附件到本地
4. 输出 Markdown 文件 + 资源目录 + 导出报告

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 文档 ID 或 slug |
| `output_dir` | string | ❌ | 输出目录，默认 `/tmp/yuque-export/<doc_id>` |
| `download_images` | boolean | ❌ | 是否下载图片/附件，默认 `true` |
| `raw` | boolean | ❌ | 返回原始 JSON，默认 `false` |

### 返回

```json
{
  "doc_id": 123456,
  "title": "文档标题",
  "output_dir": "/tmp/yuque-export/123456",
  "markdown_file": "/tmp/yuque-export/123456/文档标题.md",
  "images_downloaded": 5,
  "images_failed": 0,
  "front_matter": { "title": "...", "created_at": "..." }
}
```

---

## yuque_export_repo — 批量导出知识库

### 端点

`GET /api/v2/repos/:book_id/docs`（分页获取文档列表）  
`GET /api/v2/repos/docs/:id`（逐个获取文档内容）

### 流程

1. 分页获取全部文档列表
2. 逐个获取文档详情
3. 下载图片/附件
4. 输出 Markdown 文件 + 资源目录 + 导出报告

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID 或 namespace |
| `output_dir` | string | ❌ | 输出目录，默认 `/tmp/yuque-export/<book_slug>` |
| `download_images` | boolean | ❌ | 是否下载图片，默认 `true` |
| `raw` | boolean | ❌ | 返回原始 JSON，默认 `false` |

### 返回

```json
{
  "book_id": 123456,
  "book_name": "知识库名称",
  "output_dir": "/tmp/yuque-export/ns",
  "total_docs": 50,
  "exported": 50,
  "failed": 0,
  "images_downloaded": 120,
  "images_failed": 3
}
```

---

## yuque_copy_doc — 单文档跨库复制

### 端点

`GET /api/v2/repos/docs/:id`（获取源文档）  
`POST /api/v2/repos/:book_id/docs`（创建目标文档）  
`PUT /api/v2/repos/:book_id/toc`（挂载到目录）

### 两种模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| 模式 1 | Agent 传入清洗后的 title/body/format/paths，工具创建文档 | 小文档（<30KB） |
| 模式 2 | Agent 传入 doc_id+source_book_id，工具拉取源文档返回给 Agent 清洗，Agent 再调模式 1 | 大文档（>30KB），避免 mcporter CLI 传 body 不稳定 |

### 参数（模式 1）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target_book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `title` | string | ✅ | 文档标题 |
| `body` | string | ✅ | 文档内容 |
| `format` | string | ✅ | 格式：`markdown` / `lake` / `html` |
| `paths` | string | ✅ | JSON 数组，1-5 个目录路径 |
| `slug` | string | ❌ | 自定义 slug |
| `public` | number | ❌ | 可见性 |

### 参数（模式 2）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `target_book_id` | string | ✅ | 目标知识库 ID 或 namespace |
| `source_book_id` | string | ✅ | 源知识库 ID 或 namespace |
| `doc_id` | string | ✅ | 源文档 ID |

### 返回（模式 1）

```json
{
  "doc_id": 123456,
  "title": "文档标题",
  "path": "目标目录/子目录"
}
```

### 返回（模式 2）

```json
{
  "mode": "fetch",
  "doc_id": 123456,
  "title": "源文档标题",
  "body": "原始 Markdown 内容（供 Agent 清洗）",
  "format": "markdown"
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
| `documents` | string | ✅ | JSON 数组，每个元素含 `title`/`body`/`format`/`paths` |

### 返回

```json
{
  "total": 10,
  "created": 10,
  "failed": 0,
  "docs": [
    { "doc_id": 123456, "title": "文档1", "path": "分类A" }
  ]
}
```

---

## yuque_embed_url — 嵌入阅读器 URL

### 端点

无（纯工具函数，基于语雀嵌入文档阅读器规范）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | ❌ | 语雀文档完整 URL（与 doc_id+book_id 互斥） |
| `doc_id` | string | ❌ | 文档 ID（需配合 book_id 或 namespace） |
| `book_id` | string | ❌ | 知识库 ID 或 namespace |

### 返回

```json
{
  "embed_url": "https://www.yuque.com/embed/yuque/developer/doc?app=myapp",
  "note": "嵌入模式仅支持公开文档"
}
```

---

## yuque_batch_get_docs — 批量获取文档

### 端点

`GET /api/v2/repos/docs/:id`（并发 N 个请求）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | string | ✅ | 知识库 ID 或 namespace |
| `ids` | string | ✅ | JSON 数组，文档 ID 或 slug，最多 20 个 |
| `raw` | boolean | ❌ | 返回原始 JSON |

### 返回

```json
{
  "total": 5,
  "success": 5,
  "failed": 0,
  "docs": [
    { "id": 123, "title": "文档1", "body": "..." }
  ]
}
```

---

## yuque_batch_get_repos — 批量获取知识库

### 端点

`GET /api/v2/repos/:id`（并发 N 个请求）

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ids` | string | ✅ | JSON 数组，知识库 ID 或 namespace，最多 20 个 |
| `type` | string | ❌ | 知识库类型：`Book` / `Group` / `Team`，默认 `Book` |
| `raw` | boolean | ❌ | 返回原始 JSON |

### 返回

```json
{
  "total": 3,
  "success": 3,
  "failed": 0,
  "repos": [
    { "id": 456, "name": "知识库1", "slug": "ns1" }
  ]
}
```

---

## 错误处理

所有扩展工具共用 `references/api/errors.md` 中的错误码体系。网络异常、Token 过期、限流等错误会以统一格式返回。