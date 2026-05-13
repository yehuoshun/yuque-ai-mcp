# AI 问答详细流程（三层分级检索）

> v2.0：三层分级检索。Layer 1 问题匹配（token 0）→ Layer 2 Chunk 精准生成（token 低）→ Layer 3 原生兜底。
> 概述和触发条件见 SKILL.md → 第 9 节。
> API 调用使用 [api_helper.py](api_helper.py) 中的通用封装（`yuque_get`、`parallel_get` 等）。

## 检索流程（三层分级）

```
用户提问
    ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 1：问题匹配（token 0，耗时 <0.5s）                   │
│                                                           │
│ 用户提问 → 多路并行搜索 index_master_book                   │
│   ├─ 路1：原句直接搜                                      │
│   ├─ 路2：LLM 转标准问法再搜                                │
│   ├─ 路3：实体提取搜                                       │
│   └─ 路4：同义词展开搜                                      │
│                                                           │
│ → 合并结果 → 读命中子文档 → 提取索引条目                     │
│ → 逐条目匹配 questions 字段：                               │
│   ├─ 精确匹配：直接命中                                    │
│   └─ 模糊匹配：本地 TF-IDF 计算相似度 ≥0.75（阈值可配）       │
│                                                           │
│       命中？ ──是──→ 返回 direct_answer + 源链接             │
│        │                    耗时 0.3s，token 0              │
│       否                                                    │
│        ↓                                                    │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2：Chunk 精准检索（token 低，耗时 ~1.5s）             │
│                                                           │
│ Layer 1 没命中 questions → 但搜索返回了候选条目               │
│ （关键词命中，questions 未命中）                              │
│                                                           │
│ → 选 Top 5 chunk 条目（按 chunk 条目的语雀搜索排序分）        │
│ → 并行读 chunk 原文：                                       │
│    用 source_range 定位 → GET /repos/{repo_id}/docs/{doc_id}?raw=1  │
│    → 按 source_range 标题锚点截取对应段落（只取该 chunk）     │
│ → 注入实体/关系数据作为额外上下文                            │
│ → LLM 针对用户提问生成回答                                   │
│        token ~800，耗时 ~1.5s                               │
│                                                           │
│       有候选？ ──是──→ 返回回答 + 源链接                     │
│        │                                                    │
│       无候选                                                   │
│        ↓                                                    │
└─────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3：兜底检索（token 中，耗时 ~3s）                      │
│                                                           │
│ 索引全覆盖失败 → 语雀原生搜索（不传 scope，搜全部）            │
│ → 并行获取 Top 3 全文                                       │
│ → 分段处理 + LLM 生成回答                                   │
│        token ~3000，耗时 ~3s                                │
│                                                           │
│ → 记录用户提问到状态文件 leak_queries（供迭代补洞用）          │
│ → 回答末尾追加兜底提示                                       │
└─────────────────────────────────────────────────────────┘
```

## 三层对比

| 层级 | 触发条件 | 耗时 | token | 命中率预期 |
|------|---------|------|-------|-----------|
| Layer 1 | questions 精确/模糊匹配 | 0.3s | 0 | ~45% |
| Layer 2 | 关键词命中，questions 未命中 | 1.5s | ~800 | ~35% |
| Layer 3 | 索引未覆盖 | 3.0s | ~3,000 | ~14% |
| **加权平均** | | **1.2s** | **900** | **94%** |

## 模糊匹配算法（Layer 1 内）

不调 LLM，纯本地文本计算。

```
用户问：「咋停掉自动配置」

命中子文档后提取 questions 列表：
  「如何禁用 Spring Boot 自动配置？」    → TF-IDF 相似度 0.81 ✅ 命中（≥0.75）
  「@EnableAutoConfiguration 注解的作用」 → TF-IDF 相似度 0.12
  「如何自定义自动配置类？」             → TF-IDF 相似度 0.31

取最高相似度 ≥ 0.75 → 返回 direct_answer
所有相似度 < 0.75 → 降级 Layer 2
```

- 阈值 `fuzzy_threshold` 默认 0.75，可在配置文件调整
- 计算方式：提取用户提问与 questions 列表每条的关键词集合 → Jaccard 相似度 + 字符 bigram 重叠度加权

## 多路并行搜索（Layer 1 入口）

```
用户提问：「SpringBoot 启动的时候自动配置咋加载的」

分 4 路并行搜索 index_master_book：

  路1 — 原句：直接搜「SpringBoot 启动的时候自动配置咋加载的」
  路2 — 标准问法：LLM 转「Spring Boot 启动流程」「自动配置加载机制」
  路3 — 实体提取：LLM 识别「@EnableAutoConfiguration」「spring.factories」
  路4 — 同义词：查 synonym_map →「SpringBoot」「AutoConfiguration」

四路结果合并 → 按源文档 ID+chunk_index 去重 → 进入 Layer 1 匹配
```

> `ThreadPoolExecutor`，并发数 ≤ 5。路数虽多但范围不重叠，总耗时 ≈ 最慢那路（<0.5s）。

## 索引库设计

- 每个关键词对应一个**总文档** + 多个**子文档**
- 总文档标题：`[索引] {关键词}`，存储元信息（JSON 格式）
- 子文档标题：`[索引] {关键词} (1)`、`[索引] {关键词} (2)`...
- 子文档存储具体索引条目（含 chunk 条目），接近 200kb 时新建下一个子文档
- 搜索时匹配总文档标题，从总文档获取子文档列表

## 索引条目字段（v2.0 新增）

索引条目（子文档中每条）现包含以下字段。`questions` / `direct_answer` / `chunk_index` / `source_range` 为 v2.0 新增。

| 字段 | 用途 | 搜索阶段使用 |
|------|------|-------------|
| `摘要` | 文档摘要 | Layer 2/3 Rerank |
| `关键词` | 关键词列表 | 语雀搜索命中 |
| `实体` / `关系` | 结构化实体关系 | Layer 2/3 注入上下文 |
| `questions` 🆕 | 预生成自然语言问句 5-8 个 | Layer 1 匹配 |
| `direct_answer` 🆕 | 预生成浓缩回答 200-500 字 | Layer 1 直接返回 |
| `chunk_index` 🆕 | chunk 序号 (N/M)，null=未分块 | 定位 chunk 原文 |
| `source_range` 🆕 | 原文锚点（章节标题） | 读原文时截取对应段落 |
| `源文档ID` | 源文档 ID | 读原文、生成链接 |
| `源知识库ID` | 源知识库 ID | 读原文 |
| `Namespace` | 源知识库 namespace | 搜索 scope、读原文拼路径 |
| `Slug` | 源文档 slug | 生成链接 |

## 搜索步骤详解

### 步骤 1：多路并行搜索

1. 读取配置获取 `index_master_book` 的 `namespace`
2. LLM **一次调用**完成：Query 扩展 + 实体识别 + 同义词查表
   - 输出：`{original, standard_queries[], entities[], synonyms[]}`
3. 拼成 4 路搜索词列表，并行调用 `/api/v2/search?q={词}&type=doc&scope={namespace}`（`ThreadPoolExecutor`，并发数 ≤ 5）
4. 合并搜索结果 → 按 (源文档ID, chunk_index) 去重
5. 对命中的总文档，获取子文档内容（`raw=1`）→ 解析出索引条目列表

### 步骤 2：Layer 1 — 问题匹配

1. 遍历所有索引条目的 `questions` 数组
2. 先精确匹配用户原问 + LLM 标准问法
3. 精确未命中 → 模糊匹配（TF-IDF 相似度 ≥ `fuzzy_threshold`）
4. **命中** → 取该条目的 `direct_answer` 作为回答正文
   - 附上源文档链接（从条目的 `Namespace` + `Slug` 拼）
   - **结束**，不再走 Layer 2/3
5. **全部未命中** → 进入步骤 3

### 步骤 3：Layer 2 — Chunk 精准检索

1. 收集 Layer 1 中关键词命中的索引条目（questions 未命中但 keywords 命中的）
2. 按语雀搜索排序分取 Top 5 条目
3. 并行获取 chunk 原文：
   - `GET /repos/{源知识库ID}/docs/{源文档ID}?raw=1`
   - 获取全文后按 `source_range` 标题锚点截取对应段落
   - 若 `chunk_index=null`（未分块文档）→ 取全文，按原有分段逻辑处理
4. 注入条目的实体/关系数据作为额外上下文
5. LLM 针对用户提问生成回答 → 标注来源 → **结束**

### 步骤 4：Layer 3 — 兜底检索

1. 使用语雀原生搜索 API，**不传 `scope`**（搜全部）
2. 用 LLM 扩展后的关键词并行搜索（`ThreadPoolExecutor`，并发数 ≤ 5）
3. 按源文档 ID 去重，取 Top 3
4. 并行获取全文 → 分段处理 → LLM 生成回答 → 标注来源
5. 记录用户提问到状态文件 `leak_queries`（供迭代补洞）
6. 回答末尾追加兜底提示

## Layer 1 直接返回格式

```markdown
📝 **源文档标题**
来源：知识库名称
链接：https://www.yuque.com/xxx/xxx

...direct_answer 正文...

---
⚡ 直接命中（Layer 1），耗时 <1s
```

## Layer 2/3 回答格式

```markdown
根据你的语雀笔记，找到以下相关内容：

📝 **文档标题**
来源：知识库名称
链接：https://www.yuque.com/xxx/xxx

...AI 总结内容...

---
共参考 N 篇文档
```

若通过 Layer 3 原生搜索兜底，末尾追加：

```markdown
💡 当前为原生搜索结果，语义精度有限。该问题已记录，后续索引构建后将自动补齐。
```

## 搜索参数

- `candidates_limit`: 候选数，默认 20
- `top_k`: 获取全文数，默认 5（Layer 2）/ 3（Layer 3）
- `segment_length`: 分段长度，默认 2000
- `cache_ttl_minutes`: 缓存有效期，默认 30
- `fuzzy_threshold` 🆕: Layer 1 模糊匹配阈值，默认 0.75

## 搜索缓存

配置文件 `search_cache` 指定缓存位置（默认 `~/.openclaw/workspace/utils/yuque/search_cache.json`）。`cache_ttl_minutes` 控制有效期。

```json
{
  "md5(用户问题)": {
    "answer": "根据你的语雀笔记...",
    "sources": [{"doc_id": 123, ...}],
    "layer": 1,
    "timestamp": "2026-05-03T11:00:00+08:00"
  }
}
```

缓存命中 → 直接返回；缓存过期或未命中 → 走完整搜索流程 → 写入缓存。

> Layer 1 直接命中的缓存长期有效（`direct_answer` 不变）；Layer 2/3 结果按默认 TTL 过期。

## 实体增强搜索

索引条目中的「实体」和「关系」字段会作为额外上下文注入 Layer 2/3 的 LLM prompt。LLM 优先用结构化关系数据直接回答，不足时结合原文。

### 工作原理

```
用户问「亿级流量系统用了什么技术」
  → 搜索结果命中条目，提取到：
     实体: @实体:Redis(中间件), @实体:Elasticsearch(中间件)
     关系: Redis→用于→亿级流量系统 | ES→用于→亿级流量系统
  → 注入 LLM prompt（与 chunk 原文/分段并列）
  → LLM 优先用关系数据回答
```

### 降级策略

实体/关系数据不足以回答时，LLM 自动从 chunk 原文/分段中获取。

## 同义词扩展

索引构建时 LLM 提取的同义词关系写入本地缓存文件（`synonym_map.json`），搜索时直接查表，避免每次调 LLM。

### 同义词类型

- 缩写/简写：Python → py, JavaScript → js, Kubernetes → k8s
- 中英文互译：安装 → install, 配置 → config, 线程 → thread
- 近义词：安装 → 部署 → 环境搭建, 数据库 → DB → 存储
- 大小写变体：Python → python, JVM → jvm
- 专业术语变体：线程池 → ThreadPool, 并发 → concurrency

## 迭代补洞（leak_queries）

Layer 3 兜底时记录的用户提问，定期回灌索引。

### 状态文件

`index_state.json` 新增 `leak_queries` 字段：

```json
{
  "leak_queries": [
    {
      "query": "spring.factories 里能配占位符吗",
      "timestamp": "2026-05-13T10:00:00+08:00",
      "count": 3
    }
  ]
}
```

### 补洞流程

用户说「补洞」或「回灌漏提问」时：

1. 读取 `leak_queries`，按 count 降序排列
2. 对每个漏提问，用多路搜索定位相关源文档
3. 将漏提问追加到对应 chunk 索引条目的 `questions` 列表
4. 若已有 `direct_answer` 能覆盖 → 直接关联（问题匹配后会命中）
5. PUT 更新有变动的索引子文档
6. 清空 `leak_queries`，汇报补充了多少问题

## 死条目处理

### 清理提示格式

死条目积累到阈值时（条数 > 配置文件 `dead_entries_threshold`，默认 10），在回答末尾追加：

```markdown
---
⚠️ 已积累 12 条死索引条目（源文档已删除），回复「清理死索引」一键移除。
```

### 清理流程

同 v1.0，不变。见 SKILL.md → 第 9 节。
