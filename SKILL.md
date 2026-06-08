---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、回收站管理、TOC 树导航知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名/备份/下载）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」「恢复回收站...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：47 个 tools（CRUD、搜索、导出、导入、统计、群组、回收站、仪表盘、健康检查、配置管理、分组管理、目录增强）
    ↓ 提供 47 个 tools
LLM Agent                  ← 问答编排：路由 → 搜索 → 补读 → 生成答案
```

> 📦 MCP Server 源码：`server/`，通过 `npx yuque-mcp` 启动。
> 
> ⚠️ **已知限制**：语雀 v2 API 无 `/export` 端点（返回 404）。`yuque_get_doc` 的 `body` 字段即 Markdown 原文（lake 格式自动转换），无需额外导出。`yuque_batch_get_docs_body` 批量获取多篇 body，底层也是走 `get_doc`。
> 
> ⚠️ **回收站 API 依赖 Cookie**：`yuque_list_recycles` / `yuque_restore_recycle` / `yuque_destroy_recycle` 使用语雀 Web API（非 v2 OpenAPI），需要 Cookie 登录态。确保 config 中配置了 `cookie` 和 `ctoken` 字段。

---

## 业务 Skill 路由

基于 MCP 47 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

| 用户意图 | 详情 |
|----------|------|
| **管理 (manage)** | |
| 整理/复制/归类到其他库（源库不动） | [skills/manage/reorganize.md](skills/manage/reorganize.md) |
| 归档/清理/搬移/备份旧文档 | [skills/manage/archive.md](skills/manage/archive.md) |
| 自动分类/归类整理结构 | [skills/manage/classify.md](skills/manage/classify.md) |
| 统一文档格式/排版 | [skills/manage/format.md](skills/manage/format.md) |
| 重建知识库目录/优化结构 | [skills/manage/rebuild-toc.md](skills/manage/rebuild-toc.md) |
| 批量重命名 | [skills/manage/rename.md](skills/manage/rename.md) |
| 外部文档导入（本地/Obsidian/Notion ZIP） | [skills/manage/import.md](skills/manage/import.md) |
| 多篇文档合并为单篇长文 | [skills/manage/merge.md](skills/manage/merge.md) |
| 文档镜像/知识库同步/差异检测 | [skills/manage/sync.md](skills/manage/sync.md) |
| 知识库备份/下载（导出到本地目录） | [skills/manage/backup.md](skills/manage/backup.md) |
| 知识库净化/清洗内容去垃圾重建 | [skills/manage/purify.md](skills/manage/purify.md) |
| **加工 (transform)** | |
| 文档拆分/按标题层级切割 | [skills/transform/split.md](skills/transform/split.md) |
| 智能摘要/文档概括/知识库概览 | [skills/transform/summarize.md](skills/transform/summarize.md) |
| AI 多语言批量翻译/增量翻译 | [skills/transform/translate.md](skills/transform/translate.md) |
| **洞察 (insight)** | |
| 版本审计/变更追踪/协作报告 | [skills/insight/audit.md](skills/insight/audit.md) |
| 知识库运营数据/周报/仪表盘 | [skills/insight/dashboard.md](skills/insight/dashboard.md) |
| 阅读摘录/观点提取/金句行动项 | [skills/insight/digest.md](skills/insight/digest.md) |
| 知识图谱/共现图/检索增强/树搜索 | [skills/insight/knowledge.md](skills/insight/knowledge.md) |
| 知识库搜索/搜索管道 | [skills/insight/search.md](skills/insight/search.md) |
| **收集 (collect)** | |
| 小记碎片收集/主题聚类/定期回顾 | [skills/collect/inbox.md](skills/collect/inbox.md) |
| **写作 (write)** | |
| AI 写作工作室/触发词路由 | [skills/write/polish.md](skills/write/polish.md) |
| 风格分析/写作风格画像 | [skills/write/analyze.md](skills/write/analyze.md) |
| 笔记打磨/润色/扩写 | [skills/write/refine.md](skills/write/refine.md) |
| 风格迁移/模仿改写 | [skills/write/transfer.md](skills/write/transfer.md) |
| 模板写作/周报/复盘/方案/PRD | [skills/write/template.md](skills/write/template.md) |

---

## 一、工具调用

所有 47 个工具通过 MCP client 自动提供（name + description + inputSchema），Agent 直接调用即可。

> 工具列表与参数详见 [README.md](README.md#mcp-tools-全览47-个)

⚠️ 删除操作需先确认。`yuque_create_doc` 自动挂 TOC 到目录末尾。

---

## 二、知识库问答系统

> **铁律**：不用嵌入模型、不用向量数据库、不用额外模型服务、不用第三方搜索 API。仅 LLM API + 语雀 API。

### 关键词 + 同义词搜全库

```
LLM 提取关键词 + 生成同义变体
       ↓
yuque_search 多关键词并行搜全库
       ↓
yuque_batch_get_docs_body 批量读匹配文档
       ↓
LLM 生成答案
```

**流程**：

1. **关键词提取**：LLM 从用户问题中提取核心关键词
2. **同义扩展**：LLM 生成关键词的同义词/别名/缩写/全称变体（如 JVM → Java虚拟机、GC → 垃圾回收）
3. **并行搜索**：`yuque_search` 对每个关键词拼 scope 限定知识库范围，并行搜全库
4. **批量补读**：`yuque_batch_get_docs_body` 并发获取命中文档的完整正文
5. **LLM 生成答案**：基于正文内容回答

**优点**：零索引维护、零预处理。关键词 + 同义词覆盖多个搜索入口，语雀全文索引自然匹配。标题质量差的知识库也不怕——搜的是正文，不是标题。

---

> 工具列表：[README.md](README.md) | 配置参考：[config/yuque-config.example.json](config/yuque-config.example.json) | API 详情：[references/api_reference.md](references/api_reference.md)
