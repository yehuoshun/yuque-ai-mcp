---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、回收站管理、两层索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名/备份/下载）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」「恢复回收站...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：40 个 tools（CRUD、搜索、导出、导入、统计、群组、回收站、仪表盘、健康检查）
    ↓ 提供 40 个 tools
LLM Agent                  ← 问答编排：路由 → 搜索 → 重排 → 补读 → 生成答案
```

> 📦 MCP Server 源码：`mcp-server/`，通过 `npx yuque-mcp` 启动。
> 
> ⚠️ **已知限制**：语雀 v2 API 无 `/export` 端点（返回 404）。`yuque_get_doc` 的 `body` 字段即 Markdown 原文（lake 格式自动转换），无需额外导出。`yuque_batch_get_docs_body` 批量获取多篇 body，底层也是走 `get_doc`。
> 
> ⚠️ **回收站 API 依赖 Cookie**：`yuque_list_recycles` / `yuque_restore_recycle` / `yuque_destroy_recycle` 使用语雀 Web API（非 v2 OpenAPI），需要 Cookie 登录态。确保 config 中配置了 `cookie` 和 `ctoken` 字段。

> 📌 **索引架构 v2**（2026-05-24 重构）：两层索引 — 总库路由 + 子索引库。设计原则：总库只管指针，子索引库管文档。详情见 [二、知识库问答系统](#二知识库问答系统)。

---

## 业务 Skill 路由

基于 MCP 40 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

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
| 知识库搜索/索引构建/搜索管道 | [skills/map/search.md](skills/map/search.md) |
| AI 多语言批量翻译/增量翻译 | [skills/batch/translate.md](skills/batch/translate.md) |
| 文档镜像/知识库同步/差异检测 | [skills/batch/sync.md](skills/batch/sync.md) |
| 外部文档导入（本地/Obsidian/Notion ZIP，`yuque_import_doc` 单篇导入） | [skills/batch/import.md](skills/batch/import.md) |
| 多篇文档合并为单篇长文 | [skills/batch/merge.md](skills/batch/merge.md) |
| 知识库备份/下载（导出到本地目录，含图片TOC） | [skills/batch/backup.md](skills/batch/backup.md) |

---

## 一、工具调用

所有 36 个工具通过 MCP client 自动提供（name + description + inputSchema），Agent 直接调用即可。

> 工具列表与参数详见 [mcp-server/README.md](mcp-server/README.md)

⚠️ 删除操作需先确认。`yuque_create_doc` 自动挂 TOC 到目录末尾。

---

# 二、知识库问答系统

> **铁律**：不用嵌入模型、不用向量数据库、不用额外模型服务、不用第三方搜索 API。仅 LLM API + 语雀 API。

## 1. 架构：两层索引

```
索引总库 (yehuoshun/rqgc16)              ← 路由层：只存子索引库指针
    │
    ├── 📄 [路由] Java                   → [{book_id, namespace}, ...]
    ├── 📄 [路由] Python                 → [{book_id, namespace}, ...]
    └── 📄 [路由] 前端                   → [{book_id, namespace}, ...]

子索引库 (yehuoshun/index-java-1)         ← 数据层：索引文档
    ├── 📄 [索引] Spring Security 权限框架   → 关键词块 + 摘要 + 源文档指针
    ├── 📄 [索引] JVM 内存模型 GC            → 关键词块 + 摘要 + 源文档指针
    └── 📄 [索引] MyBatis 持久层             → 关键词块 + 摘要 + 源文档指针
```

三层职责：

| 层 | 内容 | 作用 |
|----|------|------|
| 总库路由文档 | JSON 数组 `[{book_id, namespace}]` | 搜「有没有这个域」→ 返回子索引库指针 |
| 子索引库描述 | JSON `{source_books, last_built}` | 运维数据：覆盖源库、构建时间 |
| 子索引文档 | 关键词块 + 摘要 + 源文档指针 | 搜具体内容 → 返回源文档指针 + 摘要 |

## 2. 数据模型

### 2.1 总库路由文档

标题：`[路由] {域名}`

正文：

```json
[
  {"book_id": 12345, "namespace": "yehuoshun/index-java-1"},
  {"book_id": 12346, "namespace": "yehuoshun/index-java-2"}
]
```

> 单域多子库是常态，直接用数组。起步就是数组，不兼容单对象。
> 分片条件：子索引库文档数过大或单篇超 200KB。

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

### 2.3 子索引文档

标题：`[索引] {源文档标题}`（经 `cleanSearchText` 清洗，去空格去符号）

正文（`---` 分块，多主题一篇文档多个块）：

```
关键词：SpringBoot自动配置EnableAutoConfiguration条件装配多数据源DataSource读写分离

摘要：SpringBoot 通过 @EnableAutoConfiguration 和 spring.factories 实现自动配置。多数据源场景通过 @ConfigurationProperties 分别配置 DataSource，配合 JPA 或 MyBatis 实现读写分离。

id=584 | namespace=yehuoshun/dil9w3
---
关键词：条件装配ConditionalOnClassConditionalOnMissingBean

摘要：SpringBoot 条件装配注解 @ConditionalOnClass 自动检测 classpath 是否存在指定类，@ConditionalOnMissingBean 检测容器中是否缺少指定 Bean。

id=584 | namespace=yehuoshun/dil9w3
```

每块结构：

| 行 | 格式 | 作用 |
|----|------|------|
| 关键词 | `关键词：{纯字母数字中文}` | **代码层 `cleanSearchText()` 强制清洗**后的关键词行，供语雀搜索 API 分词命中 |
| 摘要 | `摘要：{100-200 字}` | LLM 重排序用，判断相关性 |
| 指针 | `id={doc_id} \| namespace={ns}` | 源文档定位 |

> ⚠️ **代码层清洗**：`createIndexDoc` 写入前对 keywords 和 title 执行 `cleanSearchText()`（去空格+去符号+只留字母数字中文）。LLM 写出什么符号都无所谓——入库前兜底洗掉。

### 2.2 清洗规则


### 2.3 字符清洗（代码层兜底）

`kb.ts` 的 `cleanSearchText()` 在 `createIndexDoc` 写入前强制执行：
- 去所有空格 → 复合术语粘连（`Spring Boot` → `SpringBoot`）
- 去所有符号（`@` `#` `-` `.` `_` 等）→ 只剩纯字母数字中文

> LLM 输出什么符号都无所谓——入库前兜底洗掉。
>
> **索引构建完成后必须验证**：对每个新索引文档跑 1-2 个含空格术语的搜索，确认能命中。

### 2.4 索引构建流程

**逐源文档构建**：

```
1. yuque_list_docs → 列出源库全部文档
2. 逐文档：yuque_get_doc 读正文 → LLM 分析 → 输出 blocks[] → yuque_index_create(index_book_id)
3. 全部完成后更新子索引库 description 的 last_built
4. yuque_create_doc → 总库创建/更新 [路由] 文档
```

LLM 逐文档分析任务：
1. 识别文档覆盖的所有主题（1~N 个）
2. 每主题生成一个 block：穷举关键词 + 摘要 + id/namespace
3. 多主题 → 多个 blocks（一个文档一个索引文档，--- 分块）

> **一文档多主题**：doc 584 同时覆盖「自动配置」「条件装配」两个主题 → 索引文档内含两个 `---` 分隔的块。搜索命中任一块，kbSearch 返回对应块的 keywords + summary。

## 3. 搜索流程

```
用户提问: "springboot怎么连多个库"
         │
         ├─[0] 前置：用户指定了文档名？
         │      → 直接 yuque_search 全库搜索 → 读原文 → 回答（短路）
         │
         ├─[1] LLM 判断域名 → 读总库路由文档
         │      → 获取子索引库 book_id + namespace
         │
         ├─[2] LLM 生成 2-5 个独立搜索 token（每个 ≤1 个词，无空格无符号）
         │     "springboot怎么连多个库" → ["SpringBoot", "多数据源", "DataSource", "读写分离"]
         │
         ├─[3] Agent 调 yuque_kb_search(tokens, index_book_ns, index_book_id)
         │     N 路并行搜索 + 去重 + 读索引文档 body（并发 5）+ 解析 --- 分块
         │     → 返回 source_entries（每块含 keywords + summary + did + ns）
         │
         ├─[4] 同一个索引文档可能命中多个块（不同主题）→ 全部作为 source_entries 返回
         │
         ├─[5] 候选 > 5 篇？→ 用 entries 自带的 keywords + summary 让 LLM 重排 → Top 5
         │     候选 ≤ 5 篇？→ 直接下一步
         │
         ├─[6] 并发 yuque_get_doc 读源文档原文
         │
         ├─[7] LLM 生成答案 + 引用出处
         │
         ├─[降级] 命中不足 → 二轮补搜新 token
         │         还不够 → 降级全库搜索（不传 scope）
         │
         └─[兜底] 全 0 命中 → 「未找到相关内容，请尝试换个问法」
```

### 3.1 为什么独立 token 并行而不是 AND 查询

- 语雀搜索 API 对多 token 做 AND 匹配："前端 部署" 要求两词同时出现在同一文档 → 极易 0 命中
- 独立 token 并行：["前端"] + ["部署"] 各自搜 → 每个 token 独立命中 → 去重合并
- 实测：AND 模式命中率 73%，独立 token 并行 **100%**（15/15）
- 每个 token 独立命中后，LLM 重排筛选保证准确率
- 结论：N 路并行（每个 token 独立搜）彻底绕开 AND 限制，命中率接近 100%

### 3.2 降级策略

```
索引管线 2 路搜索 0 命中
  ↓
二轮搜索：LLM 分析缺什么 → 生成新搜索词 → 再跑 yuque_kb_search
  ↓ 仍不够
降级全库搜索：yuque_search 不传 scope → 语雀原生全库搜索
  → 读原文 → 回答
  ↓ 仍 0 命中
返回「未找到相关内容，请尝试换个问法」
```

## 4. 搜索 Prompt 模板

### 4.1 搜索 Token 生成

```
将用户自然语言问题转换为 2-5 个独立搜索 token，每个 token 在语雀搜索 API 中单独并行查询。

⚠️ 语雀搜索对空格做 AND 匹配，token 越多越可能 0 命中。每个 token 单独搜避免 AND 陷阱。

要求：
1. 提取 2-5 个最核心的技术术语，每个 ≤1 个词
2. 覆盖不同角度：核心概念、同义表达、俗称、缩写
3. 严禁空格、符号、emoji——token 内部必须是纯字母/数字/中文
4. 复合术语用无空格形式：SpringBoot 不用 Spring Boot
5. 禁止泛词："方法""怎么""搞""啥"等

用户问题：{question}

输出 JSON 数组：
["token1", "token2", ...]
```

### 4.2 重排序 Prompt

```
以下是从语雀索引库搜索到的文档摘要和关键词。根据用户问题判断每篇的相关性，筛选出最相关的 5-8 篇，按相关性降序输出。

用户问题：{question}

候选文档（含 keywords + summary）：
{candidates}

要求：
1. 只输出最相关的 5-8 篇，不相关的不输出
2. 相同 did 出现多次（不同主题块）→ 取最相关的那块即可
3. 输出格式：序号. doc_id 标题 — 相关原因（一句话）
```

### 4.3 答案生成

```
基于以下文档内容回答用户问题。每篇文档标注了来源。

文档内容：
{doc_contents}

用户问题：{question}

要求：
1. 优先使用文档中的信息
2. 信息不足时标注「以下信息未在语雀文档中找到」
3. 回答末尾列出引用来源：标题 + 链接
```

## 5. 并发策略

| 阶段 | 并发数 | 说明 |
|------|--------|------|
| 搜索子索引库 | N（token 数） | 每个 token 独立并行搜，结果去重合并 |
| 读索引文档 body | 5（分批并发） | 每批 5 个并发 yuque_get_doc，避免连接池耗尽（kb.ts 代码层限制） |
| 重排序 | - | LLM 单次调用，直接用 entries 的 summary 字段 |
| 读源文档原文 | 5 | 并发 yuque_get_doc |

---

# 三、索引构建

> ⚠️ **默认后台运行**：索引构建涉及大量 LLM 调用和 API 请求，**默认通过子代理（sub-agent）在后台执行**。
>
> **子代理超时与自动续跑**：
> 1. 每轮子代理超时固定 **15 分钟**
> 2. 超时后自动检查进度：读子索引库现有文档 → 统计已覆盖源文档 → 与全量对比
> 3. 未完成 → 保存已覆盖清单 → 自动 spawn 续跑子代理
> 4. 重复直到 100% 覆盖

## 1. 新建索引域

```
1. yuque_create_repo → 创建子索引库（命名: index-{domain}）
2. yuque_update_repo → 写入 description（source_books）
3. yuque_list_docs → 列出源库全部文档（标题 + slug + id）
4. 逐文档构建索引（可并行子代理）：
   a. yuque_get_doc 读源文档正文
   b. LLM 分析文档 → 识别覆盖的所有主题
   c. 每主题生成一个 block：关键词穷举 + 摘要 + id/namespace
      → 见 §2 的「单文档索引构建 Prompt」
   d. yuque_index_create(blocks, source_title, index_book_id)
   e. 构建后验证：搜 2-3 个预期 query → 0 命中立即修复 keywords
5. 全部完成后更新子索引库 description 的 last_built
6. yuque_create_doc → 总库创建/更新 [路由] 文档
```

```
你是一个搜索索引构建器。阅读以下文档正文，为该文档生成索引块。

⚠️ 语雀搜索 API 只匹配字母数字中文，空格拆分 token 做 AND 匹配，不匹配符号和表情。
（代码层会自动清洗，你正常用空格分隔关键词即可，入库时自动去空格去符号）

## 任务
1. 识别文档覆盖的所有独立主题（1~N 个）
2. 每主题生成一个索引块

## 每块要求

### 关键词（不限长，穷举所有用户可能搜的词）
- 核心词 + 同义词 + 缩写 + 驼峰形式 + 简写
- 相关概念：该主题涉及的下位概念、相关技术/工具/框架
- 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
- 拼音：技术术语的拼音变体（如 peizhi）
- 搜索视角自检：用户不知道有这个文档，会用什么词搜？
- ⚠️ 复合术语不要用空格：SpringBoot 不是 Spring Boot

### 摘要（100-200 字）
概述该主题在该文档中的核心内容，供搜索后 LLM 重排判断相关性。

## 输出格式（每个块）

关键词：{穷举的关键词，空格分隔}
摘要：{100-200 字摘要}

如果文档覆盖多个独立主题，用 --- 分隔多个块：

关键词：{主题1关键词}
摘要：{主题1摘要}
---
关键词：{主题2关键词}
摘要：{主题2摘要}
```

## 3. 增量更新

```
1. 读索引库 description → 拿 last_built
2. 对源库：yuque_list_docs → 筛 updated_at > last_built
3. 新增文档 → LLM 读正文 → 生成 blocks → yuque_index_create 创建新索引文档
4. 更新文档 → 定位对应索引文档（按 source_title 搜） → 重新生成 blocks → yuque_update_doc
5. 删除文档 → yuque_delete_doc 删除对应索引文档
6. 更新 description 的 last_built
```

> 文档中心模式：增删改查直接对应源文档，不需要遍历关键词索引修改 entries。

## 4. 构建后验证（强制）

> ⚠️ 每批索引文档创建后，必须跑验证。

```
对每个新索引文档，用 2-3 个预期查询搜索验证可搜索性：
1. 一个含空格术语查询（如 "Spring Boot"）→ 验证关键词行覆盖
2. 一个同义/俗称查询（如 "k8s"）→ 验证关键词行覆盖
3. 一个口语模糊查询（如 "咋配多数据源"）→ 验证问法覆盖

0 命中的 → 不通过 → 立即修复关键词行。
```

---

> 工具列表：[mcp-server/README.md](mcp-server/README.md) | 配置参考：[config/yuque-config.example.json](config/yuque-config.example.json) | API 详情：[references/api_reference.md](references/api_reference.md)