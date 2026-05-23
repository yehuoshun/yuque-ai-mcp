---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、一级索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：CRUD、搜索、导出、导入、健康检查
    ↓ 提供 34 个 tools
LLM Agent                  ← 问答编排：搜索 → 判断 → 补读 → 生成答案
```

> 📦 MCP Server 源码：`mcp-server/`，通过 `npx yuque-mcp` 启动。
> 
> ⚠️ **已知限制**：语雀 v2 API 无 `/export` 端点（返回 404）。`yuque_get_doc` 的 `body` 字段即 Markdown 原文（lake 格式自动转换），无需额外导出。`yuque_batch_get_docs_body` 批量获取多篇 body，底层也是走 `get_doc`。

---

## 业务 Skill 路由

基于 MCP 34 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

| 用户意图 | 详情 |
|----------|------|
| 归档/清理/搬移/备份旧文档 | [skills/batch/archive.md](skills/batch/archive.md) |
| 自动分类/归类/整理结构 | [skills/batch/classify.md](skills/batch/classify.md) |
| 统一文档格式/排版 | [skills/batch/format.md](skills/batch/format.md) |
| 重建知识库目录/优化结构 | [skills/batch/rebuild-toc.md](skills/batch/rebuild-toc.md) |
| 批量重命名 | [skills/batch/rename.md](skills/batch/rename.md) |
| 版本审计/变更追踪/协作报告 | [skills/batch/audit.md](skills/batch/audit.md) |
| 知识库运营数据/周报/仪表盘 | [skills/batch/dashboard.md](skills/batch/dashboard.md) |
| 智能摘要/文档概括/知识库概览 | [skills/batch/summarize.md](skills/batch/summarize.md) |
| 写作风格分析/笔记打磨/风格迁移/模板写作 | [skills/write/polish.md](skills/write/polish.md) |
| 文档关联图谱/交叉引用/知识聚类 | [skills/map/knowledge.md](skills/map/knowledge.md) |
| 阅读摘录/观点提取/金句行动项/知识卡片 | [skills/map/digest.md](skills/map/digest.md) |
| 小记碎片收集/主题聚类/定期回顾整理 | [skills/map/inbox.md](skills/map/inbox.md) |
| AI 多语言批量翻译/增量翻译 | [skills/batch/translate.md](skills/batch/translate.md) |
| 文档镜像/知识库同步/差异检测 | [skills/batch/sync.md](skills/batch/sync.md) |
| 外部文档导入（本地/Obsidian/Notion ZIP，`yuque_import_doc` 单篇导入） | [skills/batch/import.md](skills/batch/import.md) |
| 多篇文档合并为单篇长文 | [skills/batch/merge.md](skills/batch/merge.md) |

---

## 一、管理操作（调 MCP tools）

所有管理操作通过 **yuque-mcp** 的 34 个 tools 执行，不需要手动 curl。

### 知识库

| Tool | 说明 |
|------|------|
| `yuque_list_repos` | 列出所有知识库 |
| `yuque_get_repo` | 获取知识库详情 |
| `yuque_create_repo` | 创建知识库 |
| `yuque_update_repo` | 更新知识库（名称/描述/可见性） |
| `yuque_delete_repo` | ⚠️ 硬删除知识库 |

### 文档

| Tool | 说明 |
|------|------|
| `yuque_list_docs` | 列出文档 |
| `yuque_get_doc` | 获取文档（JSON 含多格式 body，raw=true 返纯文本） |
| `yuque_create_doc` | 创建文档 + 自动挂 TOC（支持 public/format/slug） |
| `yuque_update_doc` | 更新文档（标题/正文/slug/format/public） |
| `yuque_delete_doc` | ⚠️ 硬删除文档 |
| `yuque_list_doc_versions` | 文档版本历史 |
| `yuque_get_doc_version` | 文档版本详情 |

### 目录

| Tool | 说明 |
|------|------|
| `yuque_list_toc` | 列出目录结构 |
| `yuque_update_toc` | 更新目录（append/prepend/edit/remove + sibling/child） |
| `yuque_remove_toc_node` | 移除目录节点（不删文档） |

### 小记

| Tool | 说明 |
|------|------|
| `yuque_list_notes` | 列出小记 |
| `yuque_get_note` | 获取小记详情 |
| `yuque_create_note` | 创建小记 |
| `yuque_update_note` | 更新小记 |
| `yuque_delete_note` | 删除小记（软删除） |
| `yuque_restore_note` | 恢复小记 |

### 群组

| Tool | 说明 |
|------|------|
| `yuque_list_group_users` | 列出群组成员（role 筛选 + offset 分页） |
| `yuque_update_group_user` | 变更成员角色 |
| `yuque_remove_group_user` | ⚠️ 移除群组成员 |

### 统计（需 statistic:read 权限）

| Tool | 说明 |
|------|------|
| `yuque_get_group_stats` | 团队整体统计 |
| `yuque_get_member_stats` | 团队成员统计（支持筛选/排序/分页） |
| `yuque_get_book_stats` | 团队知识库统计 |
| `yuque_get_doc_stats` | 团队文档统计 |

### 批量获取 & 搜索 & 元信息

| Tool | 说明 |
|------|------|
| `yuque_search` | 搜索（支持 scope 限定范围） |
| `yuque_batch_get_docs_body` | 批量获取多篇文档 Markdown 正文（并发 5） |
| `yuque_get_user` | 当前 Token 用户详情 |
| `yuque_health_check` | 健康检查（Token + 知识库） |

### 上传

| Tool | 说明 |
|------|------|
| `yuque_upload_attachment` | 上传文件到语雀 CDN（需 Cookie 登录态。支持 image/attachment/video，上限 10MB） |
| `yuque_import_doc` | 导入单个文件到知识库（自动适配 Obsidian 格式、上传图片 CDN、创建文档）。支持预适配 body |

### 删除确认规范

| 操作 | 类型 | 确认模板 |
|------|------|---------|
| `yuque_delete_repo` | 硬删除 | `⚠️ 即将删除《XXX》，含 N 篇文档。不可恢复，确认？` |
| `yuque_delete_doc` | 硬删除 | `⚠️ 即将删除《XXX》。不可恢复，确认？` |
| `yuque_delete_note` | 软删除 | `📝 移入回收站，可恢复。确认？` |
| `yuque_remove_group_user` | 硬删除 | `⚠️ 即将将成员移出群组。不可恢复，确认？` |

### 创建文档后挂载 TOC

`yuque_create_doc` 已自动完成 TOC 挂载（appendNode 尾插到根目录末尾）。

> 💡 **首插**（放目录第一位）：`prependNode` 不支持直接用 `doc_ids` 创建，需两步：
> 1. `yuque_create_doc`（自动挂到末尾）
> 2. `prependNode` + `sibling` + `node_uuid`（文档 TOC UUID）+ `target_uuid`（首位节点 UUID）→ 移到首位
>
> 详见 `references/api_reference.md` 目录 API 章节「首插」示例。

---

# 二、知识库问答系统

> **铁律**：不用嵌入模型、不用向量数据库、不用额外模型服务、不用第三方搜索 API。仅 LLM API + 语雀 API。

## 1. 架构：一级索引 + 多路并发

### 1.1 索引库（关键词→来源）

标题 = `[索引] 关键词 (N)`。

正文 = **别名明文（首行）** + 空行隔断 + JSON。别名明文让语雀分词能捕获各种变体词，解决搜索命中率核心问题。

```
Docker 容器 容器化 容器编排 部署 运维 k8s kubernetes 镜像 image docker-compose 多服务 compose

{
  "keyword": "Docker-部署",
  "source_entries": [
    {
      "doc_id": 263733036,
      "book_id": 37800749,
      "title": "Docker Compose 多服务编排",
      "namespace": "yehuoshun/bhcllx",
      "slug": "doc263733036",
      "keywords": "docker,compose,多服务,编排",
      "content_segment": "docker-compose.yml 通过 services 字段...",
      "doc_type": "文档"
    }
  ]
}
```

> **解析逻辑**：按 `\n\n` 第一次出现的位置拆分，前半截 = 别名明文（忽略），后半截 = JSON。
> **构建原则**：单个索引文档来源 5-15 个。关键词过宽时拆细粒度（如 Docker→Docker-部署、Docker-网络）。
>
> **Lake 卡片**：正文不可读时 `content_segment` 填标题，搜索时标注「仅标题匹配」。
>
> 兼容旧 Markdown 格式（`### 标题\n- **源文档ID**: xxx`），自动识别。

## 2. 搜索流程

```
用户提问: "Java 面试怎么准备"
         │
         ├─[0] 前置：用户指定了文档名？
         │      → LLM 判断用户问题中是否明确指定了具体文档名称（含引号/书名号内的名称，或"xxx这篇文档"等表述）
         │      → 是：直接 yuque_search 全库搜索 → 读原文 → LLM 总结（短路）
         │      → 否：继续
         │
         ├─[1] LLM 生成一组搜索关键词 → 拆为单个关键词 → 并行调 yuque_search(scope=index_book.namespace)
         │      → 命中索引文档标题（标题=[索引] xx）
         │      → 调 yuque_get_doc 读全文 → 解析 body → 提取 source_entries
         │
         ├─[2] 合并去重（按 source doc_id）
         │
         ├─[3] 提取 content_segment
         │      有内容段 → 直接送入 LLM
         │      无内容段（Lake卡片）→ 标注"仅标题匹配" → 调 yuque_get_doc 读取原文尝试
         │
         ├─[4] LLM 判断 content_segment 是否足以回答
         │      不足 → 跨知识库并发调 yuque_get_doc 读取原文
         │
         └─[5] LLM 生成答案 + 引用出处
```

### 2.1 降级模式

索引管线命中不足或未配置索引时，降级为**语雀全库搜索**（不传 scope，搜用户全部知识库）：

```
LLM 生成搜索词 → yuque_search（无 scope）→ 语雀原生全库搜索
→ 返回标题 + 摘要 → LLM 筛选 → yuque_get_doc 读原文 → LLM 生成答案
```

降级触发：
- 未配置 index_book
- 索引库无命中
- content_segment 全空且原文读取失败

### 2.2 搜索降级流程

```
正常路径（索引管线）
  ↓ 索引命中不足 / 未配置索引库
降级模式（跳过索引层，yuque_search 不传 scope，搜全库）
  ↓ 仍 0 命中
返回「未找到相关内容，请尝试换个问法」
```

## 3. 搜索 Prompt 模板

### 3.1 搜索词生成

```
把用户问题改写为一组搜索关键词，空格分隔。多角度覆盖核心概念、别称、相关术语，合并输出一行。

用户问题：{question}

搜索词：
```

### 3.2 答案生成

```
基于以下内容段回答用户问题。每个内容段标注了来源。

内容段：
{content_segments}

用户问题：{question}

要求：
1. 优先使用内容段中的信息
2. 内容段不足时标注需要补充搜索
3. 回答末尾列出引用的来源 doc_name + doc_link
```

## 4. 并发策略

| 阶段 | 并发数 | 说明 |
|------|--------|------|
| 搜索词搜索索引库 | 按关键词数 | 关键词拆为单个词并行调 yuque_search |
| 读命中索引文档全文 | 按命中数 | 并行调 yuque_get_doc |
| 读原文（按需） | 2-3 | 仅 content_segment 不足时调 yuque_get_doc |

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| 语雀搜索分词质量未知 | 关键词采用词级空格分隔，降低对分词依赖 |
| LLM 提取关键词有遗漏 | 多路并发搜补位 |
| 索引库容量超 5000 | 索引文档按关键词归类，数量可控 |
| 关键词过宽→单文档来源爆炸 | 拆细粒度 + 多组关键词并发搜 |
| 别名遗漏→搜索命中不足 | 索引构建穷举别名写入 keywords 字段 |
| 索引文档内容过时 | 每次实时读取，不缓存 |
| Lake 卡片正文不可读 | content_segment 填标题兜底，搜索时标注「仅标题匹配」 |
| API 限流 | 指数退避 + X-RateLimit-Remaining 动态调节 |

## 6. 技术依赖

| 组件 | 依赖 |
|------|------|
| LLM | 任意 OpenAI 兼容 API |
| 存储 | 语雀知识库（索引库 + 内容库） |
| 搜索 | 语雀搜索 API（索引模式 scope=namespace，降级模式不传 scope 搜全库） |
| **额外依赖** | **零** |

---

# 三、索引构建（离线）

### 索引文档格式

正文 = **别名明文首行** + 空行 + JSON。

```
Python 爬虫 爬虫框架 web scraping 网页抓取 数据采集 requests beautifulsoup scrapy selenium 自动化

{
  "keyword": "Python",
  "source_entries": [
    {
      "doc_id": 123,
      "book_id": 456,
      "title": "文档标题",
      "namespace": "group/slug",
      "slug": "abc123",
      "keywords": "关键词,逗号分隔",
      "content_segment": "原文关键段落 50-200 字",
      "doc_type": "文档"
    }
  ]
}
```

> **解析**：`body.split('\n\n', 1)`，前半截忽略，后半截 JSON。
> 兼容旧格式（纯 JSON 无别名行 / Markdown `### 标题\n- **源文档ID**: xxx`），自动识别。

### 索引构建 Prompt

**单篇分析 Prompt**（生成 source_entry）：

```
你是一个搜索索引构建器。阅读以下文档，提取所有可用于搜索的关键词和短语。

要求：
1. 穷举文档中的核心概念、术语、操作名
2. 为每个核心概念穷举别名：全称、中文缩写、英文缩写、口语俗称、旧称
   例如 Kubernetes → k8s, kube, 容器编排平台, 容器调度引擎
   别名单列写入 keywords 字段，逗号分隔
3. 提取 1-3 个内容段（每段 50-200 字），写入 content_segment
4. 不虚构文档没有的事实

文档标题：{title}
文档正文：{body}

输出 JSON（单个 source_entry 对象）：
{
  "doc_id": {id},
  "book_id": {book_id},
  "title": "{title}",
  "namespace": "{namespace}",
  "slug": "{slug}",
  "keywords": "提取的关键词,逗号分隔,含别名",
  "content_segment": "提取的原文关键段落",
  "doc_type": "文档"
}
```

**别名明文生成 Prompt**（合并 source_entries 后生成索引文档）：

```
以下是一个索引文档的 source_entries 中所有 keywords 字段汇总。
请将所有关键词、别名去重展开，生成一行空格分隔的明文别名列表。

要求：
1. 合并所有 keywords，去重
2. 输出纯文本，空格分隔，不换行，不加任何标记
3. 覆盖：中文全称、简称、英文、缩写、口语俗称

所有 keywords：
{all_keywords}

别名明文：
```

### 构建流程

**全量构建**：

0. 调 `yuque_health_check` 确保索引库存在
1. 调 `yuque_list_docs` 遍历源知识库文档列表
2. LLM 逐篇分析 → 输出 source_entry JSON（单篇分析 Prompt）
3. 按关键词归类合并，同一关键词的多个 source_entry 归入一个索引文档
4. 来源过多的关键词拆细粒度（如 Docker→Docker-部署/Docker-网络）
5. LLM 合并该索引文档所有 keywords → 生成别名明文（别名明文生成 Prompt）
6. 组装正文：`别名明文 + \n\n + JSON` → 调 `yuque_create_doc` 写入索引库

**增量构建**：

1. 调用方提供 `since` 时间戳
2. 筛选 `updated_at > since` 的变更文档
3. 仅对变更文档跑构建
4. 调 `yuque_update_doc` 更新索引库中对应 source_entry
5. 调用方自行管理 `since` 时间戳

---

# 四、配置

```json
{
  "token": "语雀 API Token",
  "group": "用户名",
  "default_book": { "book_id": 0, "namespace": "" },
  "index_book": { "book_id": 0, "namespace": "" },
  "user_id": "用户 ID（yuque_get_user 返回的 id，用于文件上传）",
  "cookie": "语雀 Cookie 字符串（可选，用于图片上传）",
  "ctoken": "CSRF Token（可选，从 cookie 提取 yuque_ctoken 值）"
}
```

> 配置文件路径：`config/yuque-config.json`，MCP Server 与 Skill 共享同一配置。
> MCP Server 环境变量覆盖：`YUQUE_CONFIG_PATH`。

> API 端点/参数/错误码/限流等详细参考 → **[references/api_reference.md](references/api_reference.md)**