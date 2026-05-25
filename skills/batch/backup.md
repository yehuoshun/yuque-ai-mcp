# 知识库备份/快照（batch-backup）

把语雀文档导出到本地文件系统，保留格式、图片和元数据。支持单篇导出和全库快照。

## 触发词

```
单篇：「导出这篇」「备份这篇文档」「下载这文档」
全库：「备份知识库」「导出知识库」「下载整库」「快照」
```

---

## 模式判定

| 用户输入 | 模式 | 说明 |
|----------|------|------|
| 指定了文档名/ID | 单篇导出 | 只导出这一篇，含图片 |
| 只说知识库名，未提具体文档 | 全库快照 | 导出整个知识库所有文档 |

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
| 所属知识库 | ❌ | 从文档名搜索 | book_id / namespace / 名称 |
| 输出目录 | ❌ | `./yuque-backups/{文档名}_{日期}/` | 相对/绝对路径 |
| 含图片 | ❌ | true | 「不带图」「纯文本」→ 跳过 |

## 阶段：定位文档

### 如用户已提供 book_id
```
yuque_list_docs(book_id) → 匹配 title/slug/id → 找到直接定位
```

### 如用户未提供 book_id
```
yuque_list_repos → 所有知识库
候选知识库最多 10 个 → 每个库 yuque_list_docs → 搜索匹配文档

匹配逻辑：
  纯数字 → doc_id 精确匹配
  精确标题命中 → 直接匹配
  部分标题命中 → 列出候选让用户选
  无匹配 → 「未找到《XXX》，请确认文档名或指定知识库」
```

## 阶段：下载

```
yuque_get_doc(book_id, doc_id)
  → body（Markdown 原文）+ 元数据（title/slug/updated_at/word_count/format）

含图片模式：
  正则提取 body 中图片引用 → curl 下载到 images/
  语雀 CDN 图片 → 替换为 ./images/{hash}_{文件名}
  外链图片 → 尝试下载，失败保留原始 URL

写入：
  {输出目录}/
  ├── {文档名}.md         ← 含 YAML frontmatter + body（图片路径已替换）
  └── images/             ← 引用的图片
      └── {hash}_{文件名}.png
```

## 输出文件格式

```markdown
---
doc_id: 123456
slug: doc-slug
book_id: 78276514
book_name: 索引子库1
created_at: "2026-05-20T10:00:00+08:00"
updated_at: "2026-05-25T16:00:00+08:00"
word_count: 1500
format: markdown
source: https://www.yuque.com/yehuoshun/index-sub-1/doc-slug
---

{正文内容，图片已替换为本地路径}
```

## 报告

```
✅ 导出完成
文档：《{title}》
格式：{format} ｜ 字数：{word_count}
图片：{N} 张
📁 输出：{目录}/{文件名}.md
```

---

# 模式二：全库快照

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

## 阶段三：输出结构

```
{根目录}/
├── snapshot.json
├── README.md
├── docs/                   ← 按 TOC 层级建子目录
│   ├── 01-根级文档/
│   │   └── 文档标题.md
│   ├── 02-分组名称/
│   │   ├── 子文档.md
│   │   └── 子分组/
│   │       └── 更深层文档.md
│   └── _orphaned/
│       └── 孤儿文档.md
├── images/
│   └── {md5}_{文件名}.png
└── attachments/
    └── {md5}_{文件名}.pdf
```

TOC → 目录映射：
```
type:TITLE → 子目录（title 清理非法字符）
type:DOC   → {title}.md
同名冲突 → 追加 (1)(2)
文件名过长 → 截断 100 字符
```

## 阶段四：并发下载

```
并发数：5

每篇文档：
  yuque_get_doc → body + 元数据
  → 提取图片引用 → curl 下载 → 替换路径
  → 写入 YAML frontmatter + body
  → 进度计数
```

## 阶段五：生成清单

```json
{
  "version": "1.0",
  "repo": { "id": 78276514, "name": "...", "slug": "...", "namespace": "..." },
  "snapshot_at": "2026-05-25T16:00:00+08:00",
  "stats": { "total_docs": 150, "downloaded": 148, "failed": 2, "images": 320 },
  "docs": [{ "doc_id": 123456, "title": "...", "local_path": "docs/.../xxx.md", "updated_at": "..." }],
  "failed_docs": [{ "doc_id": 789, "title": "...", "reason": "403" }]
}
```

## 阶段六：报告

```
✅ 全库备份完成
源库：{name}（{total} 篇）
📊 文档 ✅ {success} / ❌ {failed} ｜ 图片 {image_count} 张
📁 {local_root}
📄 {local_root}/snapshot.json
```

---

## 错误处理速查

| 场景 | 处理 |
|------|------|
| 源库不存在 | 「未找到《XXX》知识库」结束 |
| 文档未找到 | 「未找到《XXX》文档，请确认名称或指定知识库」 |
| 多个同名文档 | 列出候选（所在知识库+更新时间），让用户选 |
| 源库为空 | 「知识库是空的」结束 |
| 超过 200 篇 | 提示分批 |
| 单篇读取失败(403/404) | 记录失败，继续 |
| API 限流(429) | 等 Retry-After，最多 3 次 |
| 图片下载超时 | 保留原始 URL，记录 warning |
| 文件名冲突 | 追加 (1)(2) |

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 定位库 | `yuque_list_repos` |
| 定位文档 | `yuque_list_docs` |
| 目录树 | `yuque_list_toc` |
| 读文档 | `yuque_get_doc` |
| 文件操作 | `write`、`exec(curl)` |