---
name: yuque-ai
description: 语雀全功能技能。支持知识库管理、文档管理、小记管理、目录管理、文档导出、回收站管理、两层索引知识库问答 + 批量运维（归档/分类/格式化/目录重构/重命名/备份/下载）。管理操作通过 yuque-mcp MCP Server 执行。当用户提到「语雀」时触发，如「在语雀搜索...」「归档语雀文档...」「清理知识库...」「批量整理语雀...」「备份知识库...」「恢复回收站...」。
---

# 语雀 AI 技能

## 架构

```
yuque-mcp (MCP Server)     ← 管理操作：43 个 tools（CRUD、搜索、导出、导入、统计、群组、回收站、仪表盘、健康检查、配置管理、热重载）
    ↓ 提供 43 个 tools
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

基于 MCP 43 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

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

所有 41 个工具通过 MCP client 自动提供（name + description + inputSchema），Agent 直接调用即可。

> 工具列表与参数详见 [mcp-server/README.md](mcp-server/README.md)

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
  {"did": 271898913, "ns": "yehuoshun/cgoza0"},
  {"did": 271898914, "ns": "yehuoshun/cgoza0"}
]
```

> 一个关键词可能对应多个索引文档（如超过 195KB 分片或不同子库），entries 是数组。
> 总库条目直接指向子库里的索引文档，通过 did/ns 直接 GET，不再依赖子库内搜索。

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
关键词：["SpringBoot", "SpringBoot启动", "自动配置", "EnableAutoConfiguration", "条件装配", "多数据源", "DataSource"]

摘要：SpringBoot 通过 @EnableAutoConfiguration 和 spring.factories 实现自动配置。多数据源场景通过 @ConfigurationProperties 分别配置 DataSource，配合 JPA 或 MyBatis 实现读写分离。条件装配注解 @ConditionalOnClass 和 @ConditionalOnMissingBean 按 classpath 动态决定 Bean 注册。

entries：
[{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":10},{"did":591,"ns":"yehuoshun/dil9w3","t":"条件装配与多数据源","s":"def","url":"https://www.yuque.com/yehuoshun/dil9w3/def","w":8}]
```

字段说明：

| 字段 | 格式 | 作用 |
|------|------|------|
| 关键词 | `关键词：{JSON 数组}` | 搜索面：同义词/变体/缩写/口语问法，`cleanToken` 清洗 + JSON 序列化 |
| 摘要 | `摘要：{100-200 字}` | LLM 重排序用，判断相关性 |
| entries | `entries：{JSON 数组}` | 源文档指针列表 `[{did, ns, t, s, url, w}]`，**全部必填** |

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

### 2.5 索引构建流程（v4 — 文档中心）

> 以文档为中心：每篇源文档只读一次 body，LLM 一次性输出它属于哪些关键词 + 权重。
> 聚合后再按关键词维度写入索引文档。避免逐关键词重复读文档。

```
1. yuque_create_repo → 创建子索引库（命名: index-{domain}）
2. yuque_update_repo → 写入 description（source_books）
3. yuque_list_docs → 列出源库全部文档（标题 + id + slug）

4. 逐文档评分（每文档只读一次 body）：
   ├─ body 可读（Markdown/代码）→ yuque_get_doc 读全文 → LLM 提取关键词 + 权重
   │   prompt：「分析这篇文档，输出它属于哪些关键词，各多少分（1-10）」
   ├─ body 为空/Lake 乱码/附件 → 降级：只用标题提取关键词，权重统一标 5
   └─ 代码文档 → LLM 从 import/注解/类名/方法签名提取，处理能力等同自然语言

5. 聚合：所有文档的关键词输出汇总 → 去重归一化
    "SpringBoot" / "Spring Boot" / "springboot" → 统一规范名
    生成规范关键词清单

6. 逐关键词写入：
   a. LLM 汇总该关键词下所有 {did, w} → 生成搜索面（keywords[]）+ 摘要
   b. yuque_index_create(keyword, keywords[], summary, entries, index_book_id)
   c. 构建后验证：搜 2-3 个预期 query → 0 命中修复

7. 更新子索引库 description 的 last_built
8. yuque_create_doc → 总库创建/更新路由文档
```

> 一篇源文档可被多个关键词索引覆盖（如 doc 584 同时被 `SpringBoot` 和 `ConditionalOnClass` 两个关键词索引引用）。

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
         │     "springboot怎么连多个库" → ["SpringBoot", "多数据源", "DataSource"]
         │
         ├─[3] Agent 调 yuque_kb_search(tokens, index_book_ns, index_book_id)
         │     in:title 搜总库 → 拿到 [{did, ns}] → 并发 GET 子库索引文档
         │     → parseIndexDoc 解析 keywords / summary / entries JSON
         │     → 展开 entries → 返回 source_entries（源文档指针列表）
         │
         ├─[4] 候选 > 5 篇？→ 用 summary + keywords 让 LLM 重排 → Top 5
         │
         ├─[5] 5 并发 yuque_get_doc 读源文档原文
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

### 3.2 降级策略

```
索引管线搜索 0 命中
  ↓
二轮搜索：LLM 分析缺什么 → 生成新 token → 再跑 yuque_kb_search
  ↓ 仍不够
降级全库搜索：yuque_search 不传 scope → 语雀原生全库搜索
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
3. 严禁符号、emoji——token 内部必须是纯字母/数字/中文
4. token 无空格（如 SpringBoot），代码层 cleanToken 自动清洗
5. 禁止泛词："方法""怎么""搞""啥"等

用户问题：{question}

输出 JSON 数组：
["token1", "token2", ...]
```

### 4.2 重排序 Prompt

```
以下是从语雀索引库搜索到的源文档摘要和关键词。根据用户问题判断每篇的相关性，筛选出最相关的 5-8 篇，按相关性降序输出。

用户问题：{question}

候选文档（含 keywords + summary）：
{candidates}

要求：
1. 只输出最相关的 5-8 篇，不相关的不输出
2. 相同 did 出现多次（来自不同关键词索引）→ 取最相关的那次即可
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
| 读索引文档 body | 5（分批并发） | 每批 5 个并发 yuque_get_doc |
| 重排序 | - | LLM 单次调用，直接用 summary 字段 |
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

## 0. 前置检查（索引构建前强制执行）

> ⚠️ 每次索引构建前，必须先调 `yuque_config_status` 检查配置状态。
> 配置不完整或子库满了 → 停下来修复 → 再继续构建。

```
0. yuque_config_status → 检查配置状态
   ├─ route_book（索引总库）未配置？
   │   → 通知用户：「总库没配，是否需要我创建？」
   │   → 用户确认 → yuque_create_repo → yuque_config_update
   ├─ route_book_sub（子索引库）未配置？
   │   → 同上，创建子索引库并写入配置
   ├─ 子库容量 ≥ 90%（⚠️ 警告线）？
   │   → 记录警告，继续构建（≤ 97% 不阻塞）
   │   → 同时提示用戶：「子库快满了，是否提前新建？」
   ├─ 子库容量 ≥ 97%（🛑 阻塞线）？
   │   → 必须新建子索引库后才能继续
   │   → 通知用户 → 创建 → yuque_config_update
   └─ 全部 OK → 进入步骤 1
```

## 1. 新建索引域（v4 — 文档中心）

> ⚠️ 步骤 0 通过后才能执行步骤 1+。

```
1. yuque_create_repo → 创建子索引库（命名: index-{domain}）
2. yuque_update_repo → 写入 description（source_books）
3. yuque_list_docs → 列出源库全部文档（标题 + slug + id）

4. 逐文档评分（核心步骤，每文档只读一次 body）：
   a. yuque_get_doc 读文档 body
      ├─ body 可读（Markdown/代码）→ LLM 从正文提取关键词 + 权重
      ├─ body 为空/Lake 乱码/附件 → 降级：只用标题提取关键词，w=5
      └─ 代码文档 → LLM 从 import/注解/类名/方法签名提取，信息密度高
   b. LLM 输出：该文档属于哪些关键词，每个得分多少
      → 见 §2 的「逐文档评分 Prompt」

5. 聚合：所有文档的输出汇总
   → **细粒度策略**：仅合并真正的同义不同名（如 "SpringBoot"="Spring Boot"="springboot"），
     不合并语义不同的概念（如 "Vue2"≠"Vue3"≠"前端"，"JWT"≠"JavaWeb"≠"MyBatis"）
   → 宁多勿少：每篇文档输出的每个关键词都独立保留，不作语义合并
   → 按关键词维度分发：每个关键词收集所有 {did, w, t, s}

6. 逐关键词写入（可并行子代理）：
   a. LLM 汇总该关键词下所有 entries → 生成搜索面 + 摘要
      → 见 §2 的「单关键词写入 Prompt」
   b. yuque_index_create(keyword, keywords[], summary, entries, index_book_id)
   c. 构建后验证：搜 2-3 个预期 query → 0 命中立即修复

7. 更新子索引库 description 的 last_built
8. yuque_create_doc → 总库创建/更新路由文档
```

## 2. Prompt 模板

### 2a. 逐文档评分 Prompt

```
你是一个文档分类器。阅读以下文档，判断它的核心内容属于哪些技术关键词，每个关键词的拟合度 1-10 分。

⚠️ 语雀搜索 API 只匹配字母数字中文，不匹配符号和表情。
关键词用纯字母/数字/中文，如 SpringBoot/JVM/多数据源。

## 评分标准
- 核心主题：本文档就是讲这个的 → 8-10 分
- 大段涉及：文档有大量相关内容（≥30% 篇幅）→ 5-7 分
- 一笔带过：只有一两句提到 → 不输出
- 完全不相关 → 不输出

## 关键词数量
一篇文档通常归属 1-5 个关键词。不要强行凑——只输出真正相关的。
⚠️ **细粒度原则**：不同版本（Vue2≠Vue3）、不同工具（JWT≠Shiro）、不同技术方向（前端≠Vue）
应各自独立输出。宁可多输出关键词，不要合并语义不同的概念。

## 输出格式
输出 JSON 数组，每项含 keyword 和 w：

[
  {"keyword": "SpringBoot", "w": 10},
  {"keyword": "自动配置", "w": 9},
  {"keyword": "多数据源", "w": 6}
]

⚠️ w 为 1-10 整数，必填。每篇文档至少输出 1 个关键词。
```

### 2b. 单关键词写入 Prompt

```
你是一个搜索索引构建器。当前关键词是「{keyword}」，以下文档都属于该关键词：

{entries_summary}

⚠️ 语雀搜索 API 只匹配字母数字中文，空格拆分 token 做 AND 匹配，不匹配符号和表情。
（输出 keywords 为 string[]，代码层 cleanToken 自动清洗）

## 搜索面（keywords 数组，不限长）
1. 核心词 + 同义词 + 缩写：中英文变体、驼峰形式、简写
2. 相关概念：该关键词涉及的下位概念、相关技术/工具/框架
3. 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
4. 搜索视角自检：用户不知道有这个文档，会用什么词搜？
5. 输出为 JSON 字符串数组：["SpringBoot", "SpringBoot启动", "自动配置"]

## 摘要（100-200 字）
概括该关键词下所有源文档的核心内容。

## entries
源文档指针数组，每项含 did/ns/t/s/url/w。w 已在评分阶段确定，这里不需要改。

## 输出格式
{
  "keyword": "{keyword}",
  "keywords": ["词1", "词2", ...],
  "summary": "摘要内容",
  "entries": [
    {"did": 584, "ns": "yehuoshun/dil9w3", "t": "源文档标题", "s": "slug", "url": "https://www.yuque.com/yehuoshun/dil9w3/slug", "w": 10}
  ]
}

⚠️ entries 中 did/ns/t/s/url/w 全部必填，缺一不可。w 为 1-10 整数，url 格式 https://www.yuque.com/{ns}/{s}。
```

## 3. 增量更新

```
1. 读子索引库 description → 拿 source_books + last_built
2. 对每个 source_book：yuque_list_docs → 筛 updated_at > last_built
3. 新增文档 → LLM 读正文 → 判断属于哪些已有关键词
   → 追加 did 到对应关键词索引文档的 entries
   → 无匹配关键词 → 创建新关键词索引文档
4. 更新文档 → 找到所有引用它的关键词索引 → 更新 entries 数组
5. 删除文档 → 从所有引用它的关键词索引的 entries 中移除该 did
6. 更新 description 的 last_built
```

## 4. 构建后验证（强制）

> ⚠️ 每批索引文档创建后，必须跑验证。

```
对每个新关键词索引，用 2-3 个预期查询搜索验证可搜索性：
1. 一个含空格术语查询（如 "Spring Boot"）→ 验证 keywords 覆盖
2. 一个同义/俗称查询（如 "k8s"）→ 验证 keywords 覆盖
3. 一个口语模糊查询（如 "咋配多数据源"）→ 验证问法覆盖

0 命中的 → 不通过 → 立即修复 keywords。
```

## 5. 容量检查

> 语雀知识库文档上限约 5000 篇，远大于索引构建规模。
>
> **分层容量策略**：
> | 占比 | 级别 | 行为 |
> |------|------|------|
> | < 90% | ✅ ok | 正常写入 |
> | 90% ~ 97% | ⚠️ warn | 继续写入 + 返回 `capacity_warning` |
> | ≥ 97% | 🛑 block | 拒绝写入 + 返回 actionable hint |
>
> **block 时的 Agent 自救流程**：
> 1. 看到 `error: "capacity_blocked"` → 从返回拿 `current_book` 信息
> 2. 通知用户：「子索引库已满，帮你建个新的？」
> 3. 用户确认 → `yuque_create_repo("index-{domain}-2")`
> 4. `yuque_config_update(route_book_sub_add=[{book_id, namespace}])`
> 5. 用新 `index_book_id` 重试
>
> `yuque_config_status` 工具可直接查看所有子库的容量使用率，构建前必调。

---

> 工具列表：[mcp-server/README.md](mcp-server/README.md) | 配置参考：[config/yuque-config.example.json](config/yuque-config.example.json) | API 详情：[references/api_reference.md](references/api_reference.md)