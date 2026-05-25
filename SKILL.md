---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、回收站管理、两层索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名/备份/快照/恢复）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」「恢复回收站...」。
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
| 知识库备份/快照/恢复（导出到本地目录，含图片TOC） | [skills/batch/backup.md](skills/batch/backup.md) |

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
    ├── 📄 [索引] Spring Security 权限框架   → entries: 5 篇源文档
    ├── 📄 [索引] JVM 内存模型 GC            → entries: 8 篇源文档
    └── 📄 [索引] MyBatis 持久层             → entries: 12 篇源文档
```

三层职责：

| 层 | 内容 | 作用 |
|----|------|------|
| 总库路由文档 | JSON 数组 `[{book_id, namespace}]` | 搜「有没有这个域」→ 返回子索引库指针 |
| 子索引库描述 | JSON `{source_books, last_built}` | 运维数据：覆盖源库、构建时间 |
| 子索引文档 | 搜索面 + 摘要 + entries JSON | 搜具体内容 → 返回源文档指针 + 摘要 |

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

标题：`[索引] {原子关键词} {原子关键词} ...`（≤200 chars）

正文（三层，用 `\n\n` 分隔）：

```
# 搜索面
SpringBoot Spring Boot Boot 多数据源 多数据源配置 数据源 DataSource 读写分离 配置多个数据库
springboot peizhi duo shujuyuan springboot datasource configuration multiple datasources
怎么配多数据源 如何连接多个数据库 读写分离 Primary Qualifier 主从切换
动态数据源 dynamic-datasource AbstractRoutingDataSource DataSource路由

# 摘要
SpringBoot 通过 @EnableAutoConfiguration 和 spring.factories 实现自动配置。多数据源场景通过 @ConfigurationProperties 分别配置 DataSource，配合 JPA 或 MyBatis 实现读写分离。

{"e":[{"did":584,"bid":70910909,"ns":"yehuoshun/dil9w3","s":"abc","t":"Spring Boot 自动配置原理","wc":3500}]}
```

三层说明：

| 层 | 标记 | 作用 | 构建方式 |
|----|------|------|---------|
| 搜索面 | `# 搜索面` | 穷举用户真实问法，给语雀搜索分词命中 | LLM 生成：穷举同义表达、中英文变体、口语问句、拼音 |
| 摘要 | `# 摘要` | LLM 重排序用，判断相关性 | LLM 生成：100-200 字覆盖聚合主题核心 |
| entries | `{"e":[...]}` | 结构化源文档指针 | 聚合到该主题的源文档列表 |

entries 字段：

| 字段 | 全称 | 说明 |
|------|------|------|
| `did` | doc_id | 源文档 ID |
| `bid` | book_id | 源知识库 ID |
| `ns` | namespace | 源知识库 namespace |
| `s` | slug | 源文档 slug |
| `t` | title | 源文档标题 |
| `wc` | word_count | 字数（可选） |

> 不存 `updated_at`：增量更新走子索引库全局 `last_built`，不需要逐条比时间。

### 2.3.1 原子 Token 铁律

> ⚠️ **语雀搜索 API 只匹配数字、字母、中文，不匹配符号、表情、空格。空格会拆分 token，多 token 之间是 AND 关系。**
>
> **标题和搜索面中禁止出现带空格的复合术语。** 必须遵守：
>
> | ❌ 错误 | ✅ 正确 |
> |---------|---------|
> | `Spring Boot`（空格拆分→AND匹配两词） | `SpringBoot` `Spring` `Boot`（三个独立 token） |
> | `Redis 集群` | `Redis` `集群` `RedisCluster` |
> | `MySQL 索引` | `MySQL` `索引` `MySQL索引` |
>
> **规则**：每个多词术语 → 输出「复合词（无空格）+ 每个独立词」三个 token。
> 用户搜复合词(`SpringBoot`)→命中；用户搜空格拆分(`Spring Boot`)→`Spring`和`Boot`各自命中。
>
> **索引构建完成后必须验证**：对每个索引文档跑 1-2 个含空格术语的搜索（如 `Spring Boot`、`Redis 集群`），确认能命中。

### 2.4 关键词规划策略

索引构建分两阶段，Phase 1 先规划关键词清单再逐关键词建索引——避免各文档独立提取导致同义词分裂为多个索引。

**Phase 1：LLM 扫全量源文档标题 → 输出关键词清单**

- LLM 只看标题和摘要（不读正文），速度远超逐篇深读
- 同一概念的不同表述（如「Spring 事务」「事务管理」「@Transactional 使用」）在全局视角下合并为一个关键词
- 输出：`{关键词: [预估关联文档列表]}`，给 Phase 2 做分配

**Phase 2：逐关键词 LLM 读正文 → 判断拟合度 → 生成搜索面 + entries**

- LLM 已知当前关键词，读正文时带着明确目标判断：「这篇文档的核心主题是不是这个关键词？」
- 提到 Java 不等于 Java 主题——拟合度由 LLM 根据内容占比和核心主题判断
- 一篇源文档可被多个关键词索引覆盖

**关键词粒度**：从 `Spring` 到 `@Transactional` 到 `事务传播行为` 都可以成为独立关键词。粒度由 LLM 在 Phase 1 根据源文档集的内容分布决定——密集领域细分（如 事务、事务传播行为、事务隔离级别 各自独立），稀疏领域合并。

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
         │     N 路并行搜索 + 去重 + 读索引文档 body + 解析 entries + 合并去重
         │     → 返回 source_entries（源文档指针列表）
         │
         ├─[4] 命中多篇索引文档 → 取所有 entries → 按 did 去重合并
         │
         ├─[5] 候选 > 5 篇？→ 读摘要 → LLM 重排 → Top 5
         │     候选 ≤ 5 篇？→ 直接下一步
         │
         ├─[6] 并发 yuque_get_doc 读源文档原文
         │
         ├─[6] LLM 生成答案 + 引用出处
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
二轮搜索：LLM 分析缺什么 → 生成新搜索词 → 再搜子索引库
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
以下是从语雀索引库搜索到的文档摘要和标题。根据用户问题判断每篇的相关性，筛选出最相关的 5-8 篇，按相关性降序输出。

用户问题：{question}

候选文档：
{candidates}

要求：
1. 只输出最相关的 5-8 篇，不相关的不输出
2. 输出格式：序号. doc_id 标题 — 相关原因（一句话）
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
| 读索引文档 body | 5 | 并行 yuque_get_doc（仅候选 > 5 篇时） |
| 重排序 | - | LLM 单次调用 |
| 读源文档原文 | 5 | 并发 yuque_get_doc |

---

# 三、索引构建

> ⚠️ **默认后台运行**：索引构建涉及大量 LLM 调用和 API 请求，**默认通过子代理（sub-agent）在后台执行**。仅在以下情况在主会话执行：
> - 单篇/小批量（≤10 篇）测试验证
> - 增量更新（变更量 ≤5 篇）
> - 用户明确要求主会话操作
>
> **子代理超时与自动续跑**：
> 1. 每轮子代理超时固定 **15 分钟**（实测 ~10篇/min，15min 可处理 ~150 篇，超过自动续跑）
> 2. 超时后自动检查进度：读子索引库现有文档 → 统计已覆盖源文档 → 与全量对比
> 3. 未完成 → 保存已覆盖清单 → 自动 spawn 续跑子代理（传入 covered 清单 + 源文档列表）
> 4. 重复直到 100% 覆盖
> 5. 不设无限超时（防死循环/API配额耗尽/token浪费），也不设过长超时（超过 15min 的子代理空转浪费）
>
> 子代理完成后自动回报结果，不阻塞主会话。

## 1. 新建索引域（Phase 1 + Phase 2）

```
Phase 1 — 关键词规划：
1. yuque_create_repo → 创建子索引库（命名: index-{domain}）
2. yuque_update_repo → 写入 description（source_books）
3. yuque_list_docs → 列出源库全部文档（标题 + slug）
4. LLM 扫全量标题 → 输出关键词清单 + 每篇文档的预分配
   → 见 §3 的「Phase 1 关键词规划 Prompt」

Phase 2 — 逐关键词构建：
5. 按关键词清单逐条执行（可并行子代理）：
   a. yuque_get_doc 读该关键词关联的所有源文档正文
   b. LLM 判断每篇文档的拟合度 → 筛掉不符合的
   c. LLM 生成：[索引] {关键词} 的搜索面 + 摘要 + entries
      → 见 §2 的「Phase 2 单关键词索引构建 Prompt」
   d. ⚠️ 代码层 clean_search_text() 清洗搜索面（去符号去空格）
   e. yuque_create_doc → 写入子索引库
   f. 构建后验证：搜 2-3 个预期 query → 0 命中立即修复
6. 全部完成后更新子索引库 description 的 last_built
7. yuque_create_doc → 总库创建/更新 [路由] 文档
```

## 2. Phase 2 单关键词索引构建 Prompt

```
你是一个搜索索引构建器。当前关键词是「{keyword}」，阅读以下文档，为该关键词生成一篇索引文档。

⚠️ 语雀搜索 API 只匹配字母数字中文，空格拆分 token 做 AND 匹配，不匹配符号和表情。

## 拟合度判断（必须先做）
对于每篇文档，先判断其核心主题是否与当前关键词相关：
- ✅ 核心主题匹配 → 加入 entries
- ⚠️ 只是提到/涉及 → 看占比：大段相关则加入，一笔带过则跳过
- ❌ 完全不相关 → 跳过
- 示例：关键词「Java」— 文档讲 Spring Boot 用 Java 写 → ❌ 核心不是 Java；文档讲 Java 语法/特性/版本 → ✅

## 搜索面规则（不限长，全部围绕一个关键词）
1. 核心词 + 同义词 + 缩写：中英文变体、驼峰形式、简写
2. 相关概念：该关键词涉及的下位概念、相关技术/工具/框架
3. 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
4. 区分易混淆术语：如 Spring 的 Autowired 和 AutoConfiguration 不同，各自的关键词索引分别列清晰
5. 搜索视角自检：用户不知道有这个文档，会用什么词搜？

## 摘要（100-200 字）
概括该关键词覆盖的所有源文档的核心内容。

## 输出格式

关键词：{keyword}
拟合度：文档A — ✅ / ⚠️理由 / ❌理由

标题: [索引] {keyword}
搜索面:
{穷举的搜索面}
摘要:
{摘要内容}
entries:
{"e":[{"did":...,"bid":...,"ns":...,"s":...,"t":...}, ...]}
```

## 2.1 构建时字符清洗（强制，代码层）

> ⚠️ 语雀搜索 API 实测：只可靠匹配**字母、数字、中文**。空格 `# $ % _ ;` 反引号 `！？；【】《》` 等直接导致 0 命中，`- .` 命中打折。

```python
import re

def clean_search_text(text):
    """清洗搜索面和标题，只保留字母、数字、中文"""
    # 去空格
    text = re.sub(r'\s+', '', text)
    # 去掉所有非字母/数字/中文的字符
    text = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fff]', '', text)
    return text

# 构建时强制执行
title = clean_search_text(llm_title)
search_surface = clean_search_text(llm_search_surface)
```

> 一行代码兜底。LLM 写出什么符号都无所谓——写入前洗掉。

## 2.2 构建后验证（强制）

> ⚠️ 每批索引文档创建后，必须跑验证。

```
对每个新创建的索引文档，用 2-3 个预期查询搜索验证可搜索性：
1. 一个含空格术语查询（如 "Spring Boot"）→ 验证原子 token 覆盖
2. 一个同义/俗称查询（如 "k8s"）→ 验证搜索面覆盖
3. 一个口语模糊查询（如 "咋配多数据源"）→ 验证问法覆盖

0 命中的 → 不通过 → 立即修复搜索面。
```

## 3. Phase 1 关键词规划 Prompt

```
你是一个搜索索引规划器。浏览以下源库的全部文档标题，输出关键词规划清单。

⚠️ 只读标题和 slug，不读正文。目标是规划关键词，不是建索引。

## 要求
1. 扫描全部标题，识别核心主题和概念
2. 同一概念的多种表述合并为一个关键词：
   - 如「Spring 事务」「事务管理」「@Transactional 使用」「声明式事务」→ 合并为关键词「事务」
   - 不要各自独立创建索引
3. 密集领域细分：某主题文档超过 15 篇 → 考虑拆分为更细的多个关键词
4. 稀疏领域合并：某主题文档不足 3 篇 → 考虑合并到上级概念
5. 每篇文档至少归属 1 个关键词，核心文档可归属多个关键词
6. 关键词命名简洁：优先用最通用的表述

## 输出格式（JSON 数组）

[
  {
    "keyword": "关键词名",
    "doc_ids": [预估关联的文档 ID 列表]
  },
  ...
]

## 文档列表

{doc_list}
```

## 4. 增量更新

```
1. 读子索引库 description → 拿 source_books + last_built
2. 对每个 source_book：yuque_list_docs → 筛 updated_at > last_built
3. 新增文档 → LLM 读正文 → 判断属于哪些已有关键词 → 追加到对应索引文档 entries
4. 无匹配关键词 → 生成新关键词索引文档（走 Phase 2 流程）
5. 更新文档 → 找到涉及的所有关键词索引文档 → 更新 entries 数组（追加/保留/移除）
6. 删除文档 → 从所有相关关键词索引文档的 entries 中移除该 did
7. 更新 description 的 last_built
8. 总库路由文档不动
```

> 增量构建时不需要重跑 Phase 1 规划，直接按 doc_id 定位到对应关键词索引文档的 entries 数组操作。仅新增文档无法匹配任何已有关键词时才创建新关键词索引。

---

> 工具列表：[mcp-server/README.md](mcp-server/README.md) | 配置参考：[config/yuque-config.example.json](config/yuque-config.example.json) | API 详情：[references/api_reference.md](references/api_reference.md)