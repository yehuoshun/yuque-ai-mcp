# 知识库备份/快照（batch-backup）

把语雀知识库完整导出到本地文件系统，保留目录结构、图片和元数据。支持全量快照和增量备份两种模式。

## 触发词

```
全量快照：「备份知识库」「导出知识库」「下载整库」「快照」
增量备份：「增量备份」「同步到本地」「更新备份」
恢复：「从备份恢复」「还原快照」
仅预览：「看看有哪些可以备份」
```

---

## 参数解析

| 参数 | 必填 | 默认值 | 支持 |
|------|------|--------|------|
| 源库 | ✅ | — | 名称 / book_id / slug / namespace |
| 输出目录 | ❌ | `./yuque-backups/{库名}_{日期}/` | 相对/绝对路径 |
| 含图片 | ❌ | true | 「不带图」「纯文本」→ 跳过图片下载 |
| 含附件 | ❌ | false | 「含附件」「下附件」→ 下载文档附件 |
| 模式 | ❌ | 全量 | 「增量」「同步」→ 增量模式 |

模式判定：
- 含「增量/同步/更新」→ 增量模式（对比本地已有快照，只下变更的）
- 含「恢复/还原」→ 恢复模式（从本地快照还原到语雀）
- 默认 → 全量模式（重新下载全部）

---

## 阶段一：定位源库

```
yuque_list_repos → 获取所有知识库

匹配逻辑（同归档 Skill）：
  纯数字 → id 精确匹配
  含 / → namespace 精确匹配
  纯英文/不含中文 → slug 精确匹配
  其他 → slug 优先 → name 模糊匹配

唯一匹配 → 确认 ✅
多个匹配 → 列出让用户选
无匹配 → 结束
```

---

## 阶段二：获取全量文档与目录

### 2.1 获取目录树

```
yuque_list_toc(book_id=源库id) → 完整 TOC 树
递归解析所有节点 → 构建：
  - doc_list: [{doc_id, title, slug, level, parent_uuid, uuid}]
  - dir_map: uuid → 路径（用于本地目录结构）
```

### 2.2 获取文档列表（补漏）

> TOC 只包含已挂载文档。用 list_docs 补漏可能存在的未挂载文档。

```
yuque_list_docs(book_id=源库id) → 全部文档
对比 TOC → 标记未挂载文档（orphaned_docs）
```

### 2.3 截断保护

```
doc_count > 200 → 提示「知识库共 {count} 篇文档，超过 200 上限，建议分批备份或指定范围」
doc_count == 0 → 「知识库是空的」结束
```

---

## 阶段三：确定输出结构

### 3.1 基准目录

```
输出根目录 = 用户指定 || `./yuque-backups/{库名}_{YYYYMMDD}/`

结构：
{根目录}/
├── snapshot.json           ← 快照元数据（清单、时间戳）
├── README.md               ← 备份说明（含恢复方法）
├── docs/                   ← Markdown 文档（按 TOC 层级建子目录）
│   ├── 01-根级文档/
│   │   └── 文档标题.md
│   ├── 02-分组名称/
│   │   ├── 子文档.md
│   │   └── 子分组/
│   │       └── 更深层文档.md
│   └── _orphaned/          ← 未挂载文档
│       └── 孤儿文档.md
├── images/                 ← 图片文件（hash 命名防冲突）
│   └── {md5}_{原文件名}.png
└── attachments/            ← 附件（仅当含附件模式）
    └── {md5}_{原文件名}.pdf
```

### 3.2 TOC → 目录映射规则

```
遍历 TOC 树，每个节点：
  type:TITLE → 创建子目录，目录名 = title（清理非法字符）
  type:DOC   → 文件路径 = 当前目录 / {title}.md
  层级越深 → 目录嵌套越深

目录名清理：
  - 移除 / \ : * ? " < > |
  - 前后去空格
  - 空名 → _unnamed_
  - 同名冲突 → 追加 (1) (2)

文件名：
  - 移除 / \ : * ? " < > |
  - 过长截断到 100 字符
  - 追加 .md 扩展名
```

---

## 阶段四：增量检测（仅增量模式）

```
检查 {输出根目录}/snapshot.json 是否存在：
  不存在 → 降级为全量模式，提示「未找到历史快照，将执行全量备份」

  存在 → 读取快照：
    对比 doc_id + updated_at
    updated_at 未变 → 跳过
    updated_at 已变 / 新增文档 → 加入下载队列
    快照有但当前列表没有 → 标记 deleted_docs
```

---

## 阶段五：下载执行

### 5.1 并发下载文档

```
并发数：5

对每篇需要下载的文档：
  Step 1: yuque_get_doc(book_id=源库id, doc_id=文档id)
    → 成功：提取 body（Markdown 原文）、元数据
    → 403/404：记录失败，skip
    → 429：等 Retry-After，最多重试 3 次

  Step 2: 处理图片引用（含图片模式）
    正则提取 body 中的图片引用：
      ![...](url)
      <img src="url" ...>
    
    对每个图片 URL：
      如果是语雀 CDN（cdn.nlark.com / yuque.com）：
        → curl 下载到 images/
        → 原始引用替换为 ./images/{hash}_{文件名}
      如果是外链：
        → 尝试下载（超时 10s）
        → 成功 → 替换为本地路径
        → 失败 → 保留原始 URL，记录 warning

  Step 3: 写入本地文件
    → 添加 YAML frontmatter（id/slug/updated_at/created_at/word_count）
    → 写入 docs/ 对应路径

  Step 4: 更新进度计数
```

### 5.2 下载附件（含附件模式）

```
对每篇文档：
  正则提取附件链接（常见模式）
  curl 下载 → attachments/
  替换引用为本地路径
```

### 5.3 生成快照清单

```json
{
  "version": "1.0",
  "repo": {
    "id": 78276514,
    "name": "索引子库1",
    "slug": "index-sub-1",
    "namespace": "yehuoshun/index-sub-1",
    "description": "..."
  },
  "snapshot_at": "2026-05-25T16:00:00+08:00",
  "mode": "full",
  "stats": {
    "total_docs": 150,
    "downloaded": 148,
    "skipped": 0,
    "failed": 2,
    "images": 320,
    "attachments": 15
  },
  "docs": [
    {
      "doc_id": 123456,
      "title": "文档标题",
      "slug": "doc-slug",
      "local_path": "docs/01-根级/文档标题.md",
      "updated_at": "2026-05-20T10:00:00+08:00",
      "word_count": 1500
    }
  ],
  "failed_docs": [
    {
      "doc_id": 789,
      "title": "失败的文档",
      "reason": "403 Forbidden"
    }
  ],
  "deleted_docs": [],
  "image_count": 320,
  "local_root": "./yuque-backups/索引子库1_20260525/"
}
```

### 5.4 生成 README

```markdown
# 语雀知识库备份：《{库名}》

- 备份时间：{时间}
- 模式：{全量 / 增量}
- 文档数：{N} 篇
- 图片数：{M} 张
- 源库：https://www.yuque.com/{namespace}

## 恢复方法

告知 AI Agent：
「从 {本地路径} 恢复备份到语雀知识库 {目标库名}」

AI 会自动：
1. 读取 snapshot.json 获取文档清单
2. 创建目标知识库（如不存在）
3. 批量导入所有 .md 文件（含图片替换）
4. 重建目录结构

## 目录结构

- docs/ — 文档（按知识库目录层级组织）
- images/ — 文档中引用的图片
- attachments/ — 文档附件
- snapshot.json — 快照元数据
```

---

## 阶段六：恢复模式（反向操作）

```
用户触发「从备份恢复」「还原快照」

1. 读取 snapshot.json → 获取文档清单 + 源库信息
2. 用户指定目标库（或使用源库同名）
3. 目标库不存在 → yuque_create_repo 新建
4. 批量导入：
   并发 3（yuque_import_doc 单篇导入，含图片上传）
   先建文档获取 doc_id
   再按 TOC 结构用 yuque_update_toc 重建目录
5. 输出恢复报告
```

> ⚠️ 恢复前警告：目标库已有文档会被新增（不会覆盖同名文档），用户需自行处理冲突。

---

## 阶段七：报告

```
✅ 备份完成
源库：{源库name}（{total} 篇）
模式：{全量/增量}
时间：{now}

📊 统计
  文档：✅ {success} 篇  ⏭️ 跳过 {skipped} 篇  ❌ 失败 {failed} 篇
  图片：{image_count} 张
  附件：{attachment_count} 个

📁 本地路径：{local_root}
📄 快照清单：{local_root}/snapshot.json

{如有失败：}
❌ 失败详情：
  • {title}（doc_id={id}）— {原因}

💡 恢复命令：
  告知 AI：「从 {local_root} 恢复备份到语雀」
```

---

## 错误处理速查

| 场景 | 处理 |
|------|------|
| 源库不存在 | 「未找到《XXX》知识库」结束 |
| 源库为空 | 「知识库是空的」结束 |
| 超过 200 篇 | 提示分批，或按用户确认全量下载 |
| 单篇读取失败(403) | 记录失败，继续 |
| 单篇读取失败(404) | 记录「可能已删除」，继续 |
| API 限流(429) | 等 Retry-After，最多 3 次 |
| 图片下载超时 | 保留原始 URL，记录 warning |
| 磁盘空间不足 | 中止，提示清理空间 |
| 文件名冲突 | 追加 (1)(2) 去重 |
| 目录创建失败 | 中止，检查权限 |
| snapshot.json 损坏 | 降级为全量模式 |

---

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 定位库 | `yuque_list_repos` |
| 目录树 | `yuque_list_toc` |
| 文档列表 | `yuque_list_docs` |
| 读文档 | `yuque_get_doc` |
| 恢复-建库 | `yuque_create_repo` |
| 恢复-导入 | `yuque_import_doc` |
| 恢复-目录 | `yuque_update_toc` |
| 文件操作 | `write`、`exec(curl)` |