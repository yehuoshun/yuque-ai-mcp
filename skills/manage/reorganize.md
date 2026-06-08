# 批量整理（reorganize）

把知识库 A 的文档批量复制到知识库 B，**源库不动**（只复制，不删除），并自动构建目录结构。

> ⚠️ **关键区别**：
> - **整理**（本 skill）→ 复制到目标库 + 自动挂目录，源库不动
> - **归档/迁移**（archive.md）→ 复制后删除源库文档

## 触发词

```
「整理到」「搬到」「复制到」「A库整理到B库」「分到」「归类到」
```

不触发：「归档」「迁移」「清理」「移走」→ 走 archive.md

---

## 完整流程（四阶段）

```
阶段一：定位库 → 阶段二：跨库复制 → 阶段三：分类挂目录 → 阶段四：出报告
```

---

## 阶段一：定位库

### 参数解析

| 参数 | 必填 | 默认值 | 支持 |
|------|------|--------|------|
| 源库 | ✅ | — | 链接 / 名称 / book_id / slug / namespace |
| 目标库 | ✅ | — | 同上 |

标识符解析：
- **语雀链接**（`https://www.yuque.com/yehuoshun/fzmebf`）→ 提取 namespace
- **namespace**（含 `/`，如 `yehuoshun/fzmebf`）→ 直接匹配
- **纯数字** → id 精确匹配
- **纯英文** → slug 精确匹配
- **含中文** → name 模糊匹配

### 确认

```
📋 整理预览
源库：{源库name}（共 {total} 篇）
目标库：{目标库name}
模式：📋 复制（源库不动）
```

等待用户确认。

---

## 阶段二：跨库复制

```
MCP 工具：yuque_copy_docs_cross_book(
  source_book_id = 源库ID,
  target_book_id = 目标库ID,
  concurrency = 3
)
```

参数：
- `source_book_id` / `target_book_id`：源库和目标库 ID
- `doc_ids`：可选，指定文档列表；不传则复制全部
- `concurrency`：并行数，默认 3

**铁律**：此步骤不删除源库任何文档。

---

## 阶段三：分类与挂目录

> 本文档全部迁移完成后，自动分析文档来源并构建多级目录结构。

### 3.1 拉取文档列表并分类

```
MCP 工具：yuque_list_docs(book_id=目标库ID)
→ 遍历所有文档标题，按规则分类
```

**分类规则优先级**（按标题特征）：

1. **格式 `xxx | 来源名`** → 按来源名分类（二丫讲梵、博客园、卡卡罗特...）
2. **格式 `xxx - 板块 - LINUX DO`** → 按 LINUX DO 板块分类（搞七捻三、开发调优...）
3. **未匹配** → 「未分类」

分类完成后输出分类统计，供用户确认。

### 3.2 判断是否需要多级目录

规则：
- 单个分类 ≥ 100 篇且有明显子话题 → **建议三级**（来源 → 板块 → 子类）
- 单个分类 ≥ 50 但 < 100 → **建议二级**（来源 → 板块）
- < 50 → **不分**，直接挂

向用户展示建议的目录结构，等确认。

### 3.3 执行挂载

**三级目录标准流程：**

```json
// 第一级：创建父节点
yuque_batch_mount_toc({
  book_id: 目标库ID,
  categories: { "LINUX DO": [], "博客与专栏": [], "未分类": [] }
})

// 第二级：在父节点下创建板块
yuque_batch_mount_toc({
  book_id: 目标库ID,
  categories: { "搞七捻三": [doc_ids], "开发调优": [doc_ids], ... },
  parent_uuid: "LINUX_DO的UUID"
})

// 第三级：在板块下创建子类
yuque_batch_mount_toc({
  book_id: 目标库ID,
  categories: { "AI工具": [doc_ids], "数码硬件": [doc_ids], ... },
  parent_uuid: "搞七捻三的UUID"
})
```

**二级目录标准流程：**

```json
yuque_batch_mount_toc({
  book_id: 目标库ID,
  categories: { "分类1": [doc_ids], "分类2": [doc_ids], ... }
})
```

**已有目录节点的追加挂载：**

```json
yuque_batch_mount_to_existing_toc({
  book_id: 目标库ID,
  mapping: { "分类名": { uuid: "TITLE_UUID", doc_ids: [...] }, ... }
})
```

---

## 阶段四：出报告

```
✅ 整理完成
源库：{源库name}（{total} 篇）→ 目标库：{目标库name}
模式：📋 复制（源库未动）

📊 复制结果：成功 {N} 篇 | 失败 {K} 篇

📁 目录结构：
  📂 LINUX DO
  │  ├── 搞七捻三 (1023)
  │  │   ├── AI与工具 (134)
  │  │   └── 数码硬件 (96)
  │  ├── 开发调优 (489)
  │  └── ...
  ├── 二丫讲梵 (645)
  └── 未分类 (285)

报告文档：https://www.yuque.com/{namespace}
```

---

## 使用的 MCP 工具清单

| 阶段 | 工具 | 用途 |
|------|------|------|
| 定位库 | `yuque_list_repos` | 匹配源库/目标库 |
| 跨库复制 | `yuque_copy_docs_cross_book` | 批量复制文档（源库不动） |
| 分类分析 | `yuque_list_docs` | 拉取文档列表 |
| 建目录 | `yuque_batch_mount_toc` | 创建 TITLE 节点 + 挂载文档 |
| 追加挂载 | `yuque_batch_mount_to_existing_toc` | 挂载文档到已有目录 |
| 目录查询 | `yuque_get_toc_flat` | 扁平化 TOC 缓存 |

## 铁律

1. 🚫 **整理操作不删除源库任何文档。** 如需删除，用 archive.md
2. 📊 **分类后必须预览，等用户确认再执行挂载**
3. 📋 **完成后必须出详细报告，保存到语雀文档**