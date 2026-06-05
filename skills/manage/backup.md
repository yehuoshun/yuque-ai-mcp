# 知识库备份/下载（batch-backup）

把语雀文档导出到本地文件系统，保留格式、图片和元数据。支持单篇导出和全库下载。

## 触发词

```
单篇：「导出这篇」「备份这篇文档」「下载这文档」
全库：「备份知识库」「导出知识库」「下载整库」
```

---

## 模式判定

| 用户输入 | 模式 | 说明 |
|----------|------|------|
| 指定了文档名/ID | 单篇导出 | 只导出这一篇，含图片 |
| 只说知识库名，未提具体文档 | 全库下载 | 导出整个知识库所有文档 |

---

# 模式一：单篇导出

## 触发

```
「导出《XXX》」「备份这篇文档」「下载《XXX》」
```

## 参数解析

| 参数 | 必填 | 默认值 | 支持 |
|------|------|--------|------|
| 目标文档 | ✅ | — | 文档名 / doc_id / slug / URL |
| 所属知识库 | ✅ | — | book_id / namespace / 名称 |
| 输出目录 | ❌ | `./yuque-backups/{文档名}_{日期}/` | 相对/绝对路径 |
| 含图片 | ❌ | true | 「不带图」「纯文本」→ 跳过 |
| 含附件 | ❌ | false | 「含附件」「下附件」→ 下载 |

## 阶段：定位文档

```
yuque_list_repos → 匹配用户指定的知识库

匹配逻辑：
  纯数字 → id 精确匹配
  含 / → namespace 精确匹配
  纯英文/不含中文 → slug 精确匹配
  其他 → slug 优先 → name 模糊匹配

唯一匹配 → yuque_list_docs(book_id) → 匹配文档 title/slug/id
多个匹配 → 列出候选让用户选
无匹配 → 「未找到《XXX》知识库」结束
```

## 阶段：下载

```
yuque_get_doc(book_id, doc_id)
  → 完整 JSON（type/format/body/body_html/body_lake/body_sheet/body_table/...）

根据 format + type 选择输出：

| format | type | 输出文件 | 内容来源 |
|--------|------|---------|--------|
| markdown | Doc | .md | body（Markdown 原文） |
| lake | Doc | .lake.md | body（湖格式的 markdown 表达，含 Mermaid 等） |
| html | Doc | .html | body_html |
| — | Sheet | .sheet.json | body_sheet（JSON 二维数组） |
| — | Table | .table.json | body_table（JSON records） |
| — | Board | .board.json | 元数据（id/title，图集图片需单独处理） |
| — | Thread | .md | body（话题正文） |

> lake 格式的 body_lake 是语雀原生 JSON，不适合直接导出。用 body 字段
> 的 markdown 表达即可保存完整内容（含 Mermaid 图表）。

图片提取（所有格式通用）：
  正则提取 body / body_html 中的图片引用
  语雀 CDN → curl 下载到 images/ → 替换为 ./images/{hash}_{文件名}
  外链 → 尝试下载，失败保留原始 URL

写入：
  {输出目录}/
  ├── {文档名}.{ext}       ← 含 YAML frontmatter + 内容
  ├── images/               ← 引用的图片
  │   └── {hash}_{文件名}.png
  └── attachments/          ← 附件（仅当含附件模式）
      └── {hash}_{文件名}.pdf

附件下载（含附件模式）：
  从 body / body_html 中提取附件引用：
    Markdown: [文本](url)  排除图片后缀(.png/.jpg/.gif/.webp/.svg)
    HTML: <a href="url">  排除图片链接
  筛选语雀域名附件：
    cdn.nlark.com / yuque.com / *.yuque.com
  并发 curl 下载到 attachments/ → 替换引用为 ./attachments/{hash}_{文件名}
  非语雀域名的外链附件 → 尝试下载（超时 15s），失败保留原始 URL 记录 warning
```

## 输出文件格式

```yaml
---
doc_id: 123456
slug: doc-slug
book_id: 78276514
book_name: 索引库1
type: Doc          # Doc/Sheet/Thread/Board/Table
format: markdown   # markdown/lake/html/lakesheet
created_at: "2026-05-20T10:00:00+08:00"
updated_at: "2026-05-25T16:00:00+08:00"
word_count: 1500
source: https://www.yuque.com/yehuoshun/index-sub-1/doc-slug
---

{内容，图片已替换为本地路径}
```

## 报告

```
✅ 导出完成
文档：《{title}》
格式：{format} ｜ 字数：{word_count}
图片：{N} 张 ｜ 附件：{M} 个
📁 输出：{目录}/{文件名}.{ext}
```

---

# 模式二：全库下载

> 导出整个知识库，按 TOC 层级建目录结构。

## 参数解析

| 参数 | 必填 | 默认值 | 支持 |
|------|------|--------|------|
| 源库 | ✅ | — | 名称 / book_id / slug / namespace |
| 输出目录 | ❌ | `./yuque-backups/{库名}_{YYYYMMDD}/` | 相对/绝对路径 |
| 含图片 | ❌ | true | 「不带图」「纯文本」→ 跳过 |
| 含附件 | ❌ | false | 「含附件」「下附件」→ 下载 |

## 阶段一：定位源库

```
yuque_list_repos → 所有知识库

匹配逻辑：
  纯数字 → id 精确匹配
  含 / → namespace 精确匹配
  纯英文/不含中文 → slug 精确匹配
  其他 → slug 优先 → name 模糊匹配
```

## 阶段二：获取全量文档与目录

```
yuque_list_toc(book_id) → 完整 TOC 树 → 递归解析
yuque_list_docs(book_id) → 对比 TOC → 标记未挂载文档

doc_count > 200 → 提示分批
doc_count == 0 → 结束
```

## 输出结构

```
{根目录}/
├── manifest.json           ← 下载清单（时间戳 + 文档列表 + 统计）
├── README.md
├── docs/                   ← 按 TOC 层级建子目录
│   ├── 01-根级文档/
│   │   ├── 文档标题.md
│   │   ├── 数据表格.table.json
│   │   └── 网页存档.html
│   ├── 02-分组名称/
│   │   └── ...
│   └── _orphaned/
├── images/
│   └── {md5}_{文件名}.png
└── attachments/
    └── {md5}_{文件名}.pdf
```

TOC → 目录映射：
```
type:TITLE → 子目录（title 清理非法字符）
type:DOC   → {title}.{ext}（扩展名根据 format/type 决定，见格式表）
type:LINK  → {title}.url（保存外链目标 URL）
同名冲突 → 追加 (1)(2)
文件名过长 → 截断 100 字符
```

## 阶段四：并发下载

```
并发数：5

每篇文档：
  yuque_get_doc → 完整 JSON
  → 根据 format + type 选内容字段和扩展名（同单篇格式表）
  → 提取图片引用 → curl 下载到 images/ → 替换路径
  → 提取附件引用 → curl 下载到 attachments/（仅含附件模式）→ 替换路径
  → 写入 YAML frontmatter（含 type/format） + 内容
  → 进度计数
```

附件提取规则（含附件模式）：
```
Markdown: [文本](url) 排除图片后缀(.png/.jpg/.gif/.webp/.svg)
HTML: <a href="url"> 排除图片链接
语雀域名附件（cdn.nlark.com / yuque.com）→ curl 下载
外链附件 → 尝试下载（超时 15s），失败保留原始 URL
```

## 阶段五：生成清单

```json
{
  "version": "1.0",
  "repo": { "id": 78276514, "name": "...", "slug": "...", "namespace": "..." },
  "downloaded_at": "2026-05-25T16:00:00+08:00",
  "stats": { "total_docs": 150, "downloaded": 148, "failed": 2, "images": 320, "attachments": 15 },
  "docs": [{ "doc_id": 123456, "title": "...", "type": "Doc", "format": "markdown", "local_path": "docs/.../xxx.md", "updated_at": "..." }],
  "failed_docs": [{ "doc_id": 789, "title": "...", "reason": "403" }]
}
```

## 阶段六：报告

```
✅ 全库备份完成
源库：{name}（{total} 篇）
📊 文档 ✅ {success} / ❌ {failed} ｜ 图片 {image_count} 张 ｜ 附件 {attachment_count} 个
📁 {local_root}
📄 {local_root}/manifest.json
```

---

## 错误处理速查

| 场景 | 处理 |
|------|------|
| 源库不存在 | 「未找到《XXX》知识库」结束 |
| 文档未找到 | 「未找到《XXX》文档，请确认文档名或 doc_id」 |
| 源库为空 | 「知识库是空的」结束 |
| 超过 200 篇 | 提示分批 |
| 单篇读取失败(403/404) | 记录失败，继续 |
| API 限流(429) | 等 Retry-After，最多 3 次 |
| 图片下载超时 | 保留原始 URL，记录 warning |
| 附件下载超时 | 保留原始 URL，记录 warning |
| 文件名冲突 | 追加 (1)(2) |

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 定位库 | `yuque_list_repos` |
| 定位文档 | `yuque_list_docs` |
| 目录树 | `yuque_list_toc` |
| 读文档 | `yuque_get_doc` |
| 文件操作 | `write`、`exec(curl)` |