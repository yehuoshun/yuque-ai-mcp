---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、回收站管理、两层索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名/备份/下载）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」「恢复回收站...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：48 个 tools（CRUD、搜索、导出、导入、统计、群组、回收站、仪表盘、健康检查、配置管理、热重载、分组管理）
    ↓ 提供 48 个 tools
LLM Agent                  ← 问答编排：路由 → 搜索 → 重排 → 补读 → 生成答案
```

> 📦 MCP Server 源码：`server/`，通过 `npx yuque-mcp` 启动。
> 
> ⚠️ **已知限制**：语雀 v2 API 无 `/export` 端点（返回 404）。`yuque_get_doc` 的 `body` 字段即 Markdown 原文（lake 格式自动转换），无需额外导出。`yuque_batch_get_docs_body` 批量获取多篇 body，底层也是走 `get_doc`。
> 
> ⚠️ **回收站 API 依赖 Cookie**：`yuque_list_recycles` / `yuque_restore_recycle` / `yuque_destroy_recycle` 使用语雀 Web API（非 v2 OpenAPI），需要 Cookie 登录态。确保 config 中配置了 `cookie` 和 `ctoken` 字段。

> 📌 **索引架构 v2**（2026-05-24 重构）：两层索引 — 总库路由 + 子索引库。设计原则：总库只管指针，子索引库管文档。详情见 [二、知识库问答系统](#二知识库问答系统)。

---

## 业务 Skill 路由

基于 MCP 48 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

| 用户意图 | 详情 |
|----------|------|
| **管理 (manage)** | |
| 归档/清理/搬移/备份旧文档 | [skills/manage/archive.md](skills/manage/archive.md) |
| 自动分类/归类/整理结构 | [skills/manage/classify.md](skills/manage/classify.md) |
| 统一文档格式/排版 | [skills/manage/format.md](skills/manage/format.md) |
| 重建知识库目录/优化结构 | [skills/manage/rebuild-toc.md](skills/manage/rebuild-toc.md) |
| 批量重命名 | [skills/manage/rename.md](skills/manage/rename.md) |
| 外部文档导入（本地/Obsidian/Notion ZIP） | [skills/manage/import.md](skills/manage/import.md) |
| 多篇文档合并为单篇长文 | [skills/manage/merge.md](skills/manage/merge.md) |
| 文档镜像/知识库同步/差异检测 | [skills/manage/sync.md](skills/manage/sync.md) |
| 知识库备份/下载（导出到本地目录） | [skills/manage/backup.md](skills/manage/backup.md) |
| **加工 (transform)** | |
| 文档拆分/按标题层级切割 | [skills/transform/split.md](skills/transform/split.md) |
| 智能摘要/文档概括/知识库概览 | [skills/transform/summarize.md](skills/transform/summarize.md) |
| AI 多语言批量翻译/增量翻译 | [skills/transform/translate.md](skills/transform/translate.md) |
| **洞察 (insight)** | |
| 版本审计/变更追踪/协作报告 | [skills/insight/audit.md](skills/insight/audit.md) |
| 知识库运营数据/周报/仪表盘 | [skills/insight/dashboard.md](skills/insight/dashboard.md) |
| 阅读摘录/观点提取/金句行动项 | [skills/insight/digest.md](skills/insight/digest.md) |
| 文档关联图谱/交叉引用/知识聚类 | [skills/insight/knowledge.md](skills/insight/knowledge.md) |
| 知识库搜索/搜索管道 | [skills/insight/search.md](skills/insight/search.md) |
| 索引构建/重建索引 | [skills/insight/index.md](skills/insight/index.md) |
| **收集 (collect)** | |
| 小记碎片收集/主题聚类/定期回顾 | [skills/collect/inbox.md](skills/collect/inbox.md) |
| **写作 (write)** | |
| 风格分析/写作风格画像 | [skills/write/analyze.md](skills/write/analyze.md) |
| 笔记打磨/润色/扩写 | [skills/write/refine.md](skills/write/refine.md) |
| 风格迁移/模仿改写 | [skills/write/transfer.md](skills/write/transfer.md) |
| 模板写作/周报/复盘/方案/PRD | [skills/write/template.md](skills/write/template.md) |

---

## 一、工具调用

所有 48 个工具通过 MCP client 自动提供（name + description + inputSchema），Agent 直接调用即可。

> 工具列表与参数详见 [server/README.md](server/README.md)

⚠️ 删除操作需先确认。`yuque_create_doc` 自动挂 TOC 到目录末尾。

---

# 二、知识库问答系统

> **铁律**：不用嵌入模型、不用向量数据库、不用额外模型服务、不用第三方搜索 API。仅 LLM API + 语雀 API。

## 1. 架构：两层索引

```
索引总库 (yehuoshun/rqgc16)              ← 路由层：只存子索引库指针
    │
    ├── 📄 Java                       → [{did, ns}, ...]
    ├── 📄 Python                     → [{did, ns}, ...]
    └── 📄 前端                       → [{did, ns}, ...]

子索引库 (yehuoshun/index-java-1)         ← 数据层：关键词索引
    ├── 📄 SpringBoot                      → search 面 + entries: [doc584, doc591, ...]
    ├── 📄 ConditionalOnClass               → search 面 + entries: [doc584, doc589, ...]
    └── 📄 JVM                             → search 面 + entries: [doc601, doc603, ...]
```

三层职责：

| 层 | 内容 | 作用 |
|----|------|------|
| 总库路由文档 | JSON 数组 `[{did, ns}]` | 搜「有没有这个域」→ 返回子库索引文档指针 |
| 子索引库描述 | JSON `{source_books, last_built}` | 运维数据：覆盖源库、构建时间 |
| 子索引文档 | 关键词搜索面 + 摘要 + entries JSON | 搜具体内容 → 展开 entries 返回源文档指针 |

## 2. 数据模型

### 2.1 总库路由文档

标题：`{域名}`（直接用域名关键词，无前缀。总库只存路由文档，靠 body JSON 解析识别，不靠标题区分）

正文：

```json
[
  {"did": 271898913, "ns": "yehuoshun/cgoza0/ml3ukegy95xwh3eu"},
  {"did": 271898914, "ns": "yehuoshun/cgoza0/xxxxxxxxx"}
]
```

> 一个关键词可能对应多个索引文档（如超过 195KB 分片或不同子库），entries 是数组。
> 总库条目直接指向子库里的索引文档，通过 did/ns 直接 GET，不再依赖子库内搜索。
> ⚠️ ns 为文档完整路径 `{book_ns}/{slug}`，非仅 book_ns。

### 2.2 子索引库描述

子索引库的 `description` 字段存运维元数据：

```json
{
  "source_books": [70910909, 24256880],
  "last_built": "2026-05-24T16:00:00Z"
}
```

> `source_books`：该子索引库覆盖的源知识库 book_id 列表。
> `last_built`：上次全量构建时间，增量更新用。

### 2.3 子索引文档 — 关键词中心

**一个关键词 = 一篇索引文档。** 标题就是关键词本身，命中直接对得上。

标题：`{关键词}`（经 `cleanToken` 清洗，无符号前缀）

> ⚠️ 语雀搜索对符号（`[]`、`-` 等）匹配极差。标题直接用关键词本身，不加任何前缀符号。

正文：

```
文档标题：Canvas 系列课程

文档标题：02丨如何用Canvas绘制层次关系图？
关键词：["Canvas","指令式绘图","Canvas2D","层次关系图"]
搜索面：Canvas怎么绘图，Canvas指令式绘图教程，用Canvas画层次关系图
摘要：本文介绍Canvas指令式绘图基础，通过绘制层次关系图实战演示Canvas核心API。
entry：
{"did":232072822,"ns":"yehuoshun/huwsx0","t":"02丨...Canvas绘制层次关系图？.html","s":"kf8s0xue0pfzvl09","url":"https://...","w":6}

文档标题：28丨Canvas、SVG与WebGL在性能上的优势与劣势
关键词：["Canvas","SVG","WebGL","性能对比","渲染性能"]
搜索面：Canvas和SVG哪个快，WebGL性能怎么样，Canvas性能优化对比
摘要：本文对比分析Canvas、SVG、WebGL三者在渲染性能上的优劣。
entry：
{"did":232303572,"ns":"yehuoshun/huwsx0","t":"28丨Canvas、SVG与WebGL性能对比.html","s":"kfxgkov0vt9ux7da","url":"https://...","w":6}
```

字段说明：

| 字段 | 格式 | 作用 |
|------|------|------|
| 文档标题（顶） | `文档标题：{系列标题}` | 索引文档的概括标题，全文搜索用 |
| 文档标题（entry） | `文档标题：{源文档标题}` | 该 entry 对应源文档的标题 |
| 关键词 | `关键词：{JSON 数组}` | 该 entry 的技术术语面，`cleanToken` 清洗 + JSON 序列化 |
| 搜索面 | `搜索面：{纯文本}` | 该 entry 的自然语言搜索面，纯文本逗号分隔 |
| 摘要 | `摘要：{100-200 字}` | 该 entry 对应源文档的核心内容概括 |
| entry | `entry：{JSON 对象}` | 源文档指针 `{did, ns, t, s, url, w}`，**全部必填**。一对多：一个关键词可对应多篇源文档，每篇一个 entry 块 |

entries 字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `did` | ✅ | 源文档 ID |
| `ns` | ✅ | 源知识库 namespace |
| `t` | ✅ | 源文档标题 |
| `s` | ✅ | 源文档 slug |
| `url` | ✅ | 源文档完整链接（写入时自动从 ns+s 拼接兜底） |
| `w` | ✅ | 权重 1-10，LLM 判断该文档与关键词的拟合度（越高越相关） |

> ⚠️ **代码层清洗**：`createIndexDoc` 写入前 `cleanToken` 清洗每元素 → `JSON.stringify` 存入。LLM 输出 `keywords: string[]`，代码层兜底。

### 2.4 为什么关键词中心

| | 文档中心（v2） | 关键词中心（v3） |
|---|---|---|
| 标题 | `索引 {源文档标题}` — 跟搜索词无关 | `{关键词}` — 精确锚点 |
| 搜索命中 | 只靠 body 分词碰运气 | 标题 + body 双保险 |
| 标题权重 | 废的 | 语雀搜索天然给标题更高权重，**不用符号前缀** |
| 粒度 | 粗，多主题混一篇 | 细，一概念一篇 |
| 维护成本 | 低（一篇源文档 → 一篇索引） | 高（改一篇源文档 → 更新多篇关键词索引） |

> 索引是给搜索用的，不是给维护用的。搜索是主场景。

### 2.5 索引构建流程

> 完整流程 → 见 [skills/insight/index.md](skills/insight/index.md)

## 3. 搜索流程

> 完整搜索流程、Prompt 模板、降级策略、并发配置 → 见 [skills/insight/search.md](skills/insight/search.md)

---

# 三、索引构建

> 完整索引构建流程、Prompt 模板、增量更新、验证策略 → 见 [skills/insight/index.md](skills/insight/index.md)