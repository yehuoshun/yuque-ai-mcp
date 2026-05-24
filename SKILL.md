---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、两层索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：CRUD、搜索、导出、导入、健康检查
    ↓ 提供 35 个 tools
LLM Agent                  ← 问答编排：路由 → 搜索 → 重排 → 补读 → 生成答案
```

> 📦 MCP Server 源码：`mcp-server/`，通过 `npx yuque-mcp` 启动。
> 
> ⚠️ **已知限制**：语雀 v2 API 无 `/export` 端点（返回 404）。`yuque_get_doc` 的 `body` 字段即 Markdown 原文（lake 格式自动转换），无需额外导出。`yuque_batch_get_docs_body` 批量获取多篇 body，底层也是走 `get_doc`。

> 📌 **索引架构 v2**（2026-05-24 重构）：两层索引 — 总库路由 + 子索引库。设计原则：总库只管指针，子索引库管文档。详情见 [二、知识库问答系统](#二知识库问答系统)。

---

## 业务 Skill 路由

基于 MCP 35 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

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

所有管理操作通过 **yuque-mcp** 的 35 个 tools 执行，不需要手动 curl。

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
| `yuque_upload_attachment` | 上传文件到语雀 CDN（需 Cookie 登录态。支持 image/attachment/video，上限：图片20MB/附件500MB/视频500MB） |
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

### 2.4 聚合策略

一个子索引文档聚合多篇相关源文档（一对多），减少索引文档数：

| 方式 | 例子 | entries 数 |
|------|------|-----------|
| 按子主题 | Spring Security 全系列 → 一篇 | 5-20 |
| 按来源 | JavaGuide 的 JVM 所有文章 → 一篇 | 10-30 |
| 松耦合 | 无法归类的小文档 → 一篇「杂项」 | 不定 |

**上限**：单篇 200KB，单条 entry ~150 bytes，理论 ~1300 条。实际控制 **50-200 条**保证搜索面质量。

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
         ├─[3] 每个 token 单独并行搜子索引库（N 路并行）
         │     scope=子索引库namespace
         │     → 所有结果按 ID 去重合并 → 用 API summary 初筛
         │
         ├─[4] 候选 > 5 篇？→ 读子索引文档 # 摘要 → LLM 重排 → Top 5
         │     候选 ≤ 5 篇？→ 直接下一步
         │
         ├─[5] 并发 yuque_get_doc 读源文档原文
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

## 1. 新建索引域

```
1. yuque_create_repo → 创建子索引库（命名: index-{domain}）
2. yuque_update_repo → 写入 description（source_books）
3. 遍历源库 → 批量 yuque_get_doc 读正文
4. LLM 逐批分析 → 生成标题+搜索面+摘要+entries
5. ⚠️ 代码层强制拆分 token（enforce_atomic_tokens）→ 确保每个复合词的部分也独立存在
6. 构建后验证：跑 2-3 个预期查询（含空格术语/同义/口语）→ 0 命中立即修复
7. yuque_create_doc → 写入子索引库
8. 更新子索引库 description 的 last_built
9. yuque_create_doc → 总库创建/更新 [路由] 文档
```

## 2. 单篇索引构建 Prompt

```
你是一个搜索索引构建器。阅读以下文档，为它创建索引条目。

⚠️ 语雀搜索 API 只匹配字母数字中文，空格拆分 token 做 AND 匹配，不匹配符号和表情。

## 标题关键词规则（≤200 chars）
1. 提取 10-15 个最核心搜索关键词
2. ⚠️ 严禁带空格的复合术语：
   - ❌ "Spring Boot" → ✅ "SpringBoot" "Spring" "Boot"
   - ❌ "Redis 集群" → ✅ "Redis" "集群" "RedisCluster"
   - ❌ "MySQL 索引" → ✅ "MySQL" "索引" "MySQL索引"
3. 每个多词术语拆成：「复合词+独立词1+独立词2」三个 token

## 搜索面规则（不限长）
1. 穷举用户可能搜索的表达方式：同义词、俗称、缩写、中英文变体、拼音
2. ⚠️ 同样禁止带空格复合术语
3. 口语化的自然问句（"怎么配xxx""xxx是啥"）
4. 区分易混淆术语：如 Spring 的「自动装配(Autowiring/@Autowired)」和「自动配置(AutoConfiguration/@EnableAutoConfiguration)」是不同的概念，都要列出来不要混淆
5. 搜索视角自检：想象用户不知道文档标题，会用什么词搜这篇文档？把这部分也加进来

## 摘要（100-200 字）
用自己的话概括文档核心内容，不虚构。

文档标题：{title}
文档正文：{body}

输出格式：
标题: [索引] {核心关键词空格分隔}
搜索面:
{穷举的搜索面}
摘要:
{摘要内容}
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

## 3. 聚合 Prompt

```
以下是一组文档的索引条目。将它们按主题/子领域聚合，同一主题的条目归入一个子索引文档。

要求：
1. 每个子索引文档聚合 10-30 条相关条目
2. 无法归类的放入「杂项」文档
3. 输出每个子索引文档的标题关键词 + 搜索面 + 摘要 + entries 列表

文档条目：
{entries}

输出 JSON 数组：
[{"title_kw":"...", "search_surface":"...", "summary":"...", "e":[{"did":..., ...}]}, ...]
```

## 4. 增量更新

```
1. 读子索引库 description → 拿 source_books + last_built
2. 对每个 source_book：yuque_list_docs → 筛 updated_at > last_built
3. 新增文档 → LLM 分析 → yuque_create_doc 写入子索引
4. 更新文档 → 找到对应索引文档 → 更新 entries 数组 → yuque_update_doc
5. 删除文档 → 从 entries 数组移除对应条目
6. 更新 description 的 last_built
7. 总库路由文档不动
```

> 增量构建比旧设计简单：不涉及 keyword 归并、不重算别名。
> 按 doc_id 直接定位到子索引文档的 entries 数组，更新/追加/移除。

---

# 四、配置

```json
{
  "token": "语雀 API Token",
  "group": "用户名",
  "default_book": { "book_id": 0, "namespace": "" },
  "index_master_book": { "book_id": 0, "namespace": "" },
  "user_id": "用户 ID（yuque_get_user 返回的 id，用于文件上传）",
  "cookie": "语雀 Cookie 字符串（可选，用于图片上传）",
  "ctoken": "CSRF Token（可选，从 cookie 提取 yuque_ctoken 值）"
}
```

> 配置文件路径：`config/yuque-config.json`，MCP Server 与 Skill 共享同一配置。
> MCP Server 环境变量覆盖：`YUQUE_CONFIG_PATH`。
> `index_master_book`：索引总库（路由层）。子索引库 namespace 分散存储在路由文档中。

> API 端点/参数/错误码/限流等详细参考 → **[references/api_reference.md](references/api_reference.md)**