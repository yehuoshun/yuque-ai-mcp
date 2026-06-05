# 知识库搜索

基于 `yuque_kb_search` MCP 工具的单层索引搜索管道。

## 触发词

```
「搜索知识库」「查一下语雀」「语雀里有没有」
「搜文档」「找一下」「帮我查」
```

---

## 1. 搜索流程

```
用户提问 "Spring事务怎么配"
  ↓
① LLM 生成 2-5 个搜索 token
  "Spring事务怎么配" → ["Spring", "事务", "Transactional"]
  ↓
② 调 yuque_kb_search(tokens)  ← 工具内部自动完成以下步骤
  ├─ 索引库直搜：N 路并行搜所有索引库 → 匹配索引文档
  │   └─ 索引库 0 命中 → 自动降级语雀全库搜索（fallback_used="global_search"）
  ├─ 读索引文档：读 body → parseIndexDoc → 展开 entries
  ├─ 图谱扩展：命中 < 3 篇 → listAllDocs + 筛选分片 → 找邻居 → 补搜
  └─ 返回结构化 JSON（KbSearchResult）
  ↓
③ Agent 读 KbSearchResult.source_entries
  → 候选 > 5 篇？→ 用 summary + keywords → LLM 重排 → Top 5
  ↓
④ 树搜索读原文（Agent 层，见 §6）
  → 对每篇候选：检查 entry.tree 字段
  → 有 tree → LLM 读 sections 选相关章节 → 只读相关章节原文
  → 无 tree → 降级读全文
  ↓
⑤ LLM 生成答案 + 引用
```

### 1.1 工具层 vs Agent 层

| 步骤 | 在哪 | 说明 |
|------|------|------|
| 索引库直搜 | 工具层 | `yuque_kb_search` 内部自动完成 |
| 降级全库搜索 | 工具层 | 索引库 0 命中时自动触发，返回 `fallback_used="global_search"` |
| 图谱扩展 | 工具层 | 命中 < 3 篇时自动触发，返回 `graph_expanded=true` |
| 重排序 | Agent 层 | 需要 LLM 根据用户问题语义判断相关性 |
| 二轮 token 重试 | Agent 层 | 需要 LLM 分析缺什么 → 生成新 token |
| 树搜索章节选择 | Agent 层 | 需要 LLM 读 tree.sections 选相关章节 |
| 读原文 + 生成答案 | Agent 层 | 需要 LLM 综合多篇文档 |

### 1.2 返回值结构

```json
{
  "tokens": ["Spring", "事务"],
  "index_hits": 3,
  "source_entries": [
    {
      "doc_id": 584,
      "namespace": "yehuoshun/huwsx0",
      "title": "SpringBoot自动配置原理",
      "url": "https://www.yuque.com/yehuoshun/huwsx0/kf8s0xue",
      "keywords": ["SpringBoot", "自动配置", "AutoConfiguration"],
      "search_surface": "SpringBoot自动配置怎么工作的",
      "summary": "[SpringBoot] 本文详解SpringBoot自动配置原理...",
      "weight": 10,
      "tree": { "sections": [{"id": "s1", "title": "...", "summary": "..."}] },
      "sub_index_ns": "idx-java-1/springboot"
    }
  ],
  "graph_expanded": false,
  "graph_neighbors": [],
  "fallback_used": "none",
  "dirty_blocks": 0,
  "errors": [],
  "hint": null
}
```

### 1.3 为什么独立 token 并行而不是 AND 查询

- 语雀搜索 API 对多 token 做 AND 匹配："前端 部署" 要求两词同时出现在同一文档 → 极易 0 命中
- 独立 token 并行：["前端"] + ["部署"] 各自搜 → 每个 token 独立命中 → 去重合并
- 实测：AND 模式命中率 73%，独立 token 并行 **100%**（15/15）
- 每个 token 独立命中后，LLM 重排筛选保证准确率

### 1.4 降级策略

```
yuque_kb_search 内部：
  索引库搜索 0 命中
    ↓ 自动
  降级语雀全库搜索（不传 scope）
    → fallback_used="global_search"
    → source_entries 来自全库搜索结果

Agent 层：
  工具返回 source_entries 为空
    ↓
  二轮搜索：LLM 分析缺什么 → 生成新 token → 再跑 yuque_kb_search
    ↓ 仍不够
  返回「未找到相关内容，请尝试换个问法」
```

---

## 2. Prompt 模板

### 2.1 搜索 Token 生成

```
将用户自然语言问题转换为 2-5 个独立搜索 token，每个 token 在语雀搜索 API 中单独并行查询。

⚠️ 语雀搜索对空格做 AND 匹配，token 越多越可能 0 命中。每个 token 单独搜避免 AND 陷阱。

要求：
1. 提取 2-5 个最核心的技术术语，每个 ≤1 个词
2. 覆盖不同角度：核心概念、同义表达、俗称、缩写、符号转文字
   - 用户说 C# → 同时生成 CSharp、C井
   - 用户说 .NET → 同时生成 dotnet
   - 用户说 JS → 同时生成 JavaScript
   - 用户说 K8s → 同时生成 Kubernetes
   - 用户说 正则 → 同时生成 Regex、RegExp
   - 用户说 = → 同时生成 等于、等于号
   - 用户说 == → 同时生成 等于、双等于、相等比较
   - 用户说 != → 同时生成 不等于
   - 用户说 => → 同时生成 箭头函数、Lambda
   - 用户说 @ → 同时生成 注解、装饰器
   - 用户说 <> → 同时生成 泛型、尖括号
   - 用户说 [] → 同时生成 数组、中括号、下标
   - 用户说 {} → 同时生成 花括号、对象、代码块
   - 用户说 && → 同时生成 逻辑与、AND
   - 用户说 || → 同时生成 逻辑或、OR
   - 用户说 % → 同时生成 取模、取余
   - 用户说 缓存 → 同时生成 Cache
   - 用户说 消息队列 → 同时生成 MQ、MessageQueue
   - 用户说 分布式 → 同时生成 Distributed
   - 用户说 微服务 → 同时生成 MicroService
   - 用户说 设计模式 → 同时生成 DesignPattern
   - 用户说 算法 → 同时生成 Algorithm
   - 用户说 动态规划 → 同时生成 DP、DynamicProgramming
   - 用户说 负载均衡 → 同时生成 LoadBalance
   - 用户说 认证 → 同时生成 Authentication、Auth
   - 用户说 授权 → 同时生成 Authorization、RBAC
   - 用户说 序列化 → 同时生成 Serialization
   - 用户说 反射 → 同时生成 Reflection
   - 用户说 代理 → 同时生成 Proxy
   - 用户说 泛型 → 同时生成 Generics
   - 用户说 闭包 → 同时生成 Closure
   - 用户说 节流 → 同时生成 Throttle、防抖、Debounce
   - 用户说 深拷贝 → 同时生成 DeepClone、浅拷贝、ShallowCopy
3. 严禁符号、emoji——token 内部必须是纯字母/数字/中文
4. token 无空格（如 SpringBoot），代码层 cleanToken 自动清洗
5. 禁止泛词："方法""怎么""搞""啥"等

用户问题：{question}

输出 JSON 数组：
["token1", "token2", ...]
```

### 2.2 重排序 Prompt（Agent 层）

```
以下是从语雀索引库搜索到的源文档摘要和关键词。根据用户问题判断每篇的相关性，筛选出最相关的 5-8 篇，按相关性降序输出。

用户问题：{question}

候选文档（含 keywords + summary）：
{candidates}

要求：
1. 只输出最相关的 5-8 篇，不相关的不输出
2. 相同 doc_id 出现多次（来自不同关键词索引）→ 取最相关的那次即可
3. 输出格式：序号. doc_id 标题 — 相关原因（一句话）
```

### 2.3 答案生成

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

---

## 3. 参数说明

### yuque_kb_search

| 参数 | 必填 | 说明 |
|------|------|------|
| `tokens` | ✅ | 搜索 token 数组（LLM 生成，每个独立并行搜） |
| `max_entries` | ❌ | 返回源文档最大条数（默认 20），超出的按 weight 降序截断，低权重自然淘汰 |

### 返回值字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `tokens` | string[] | 使用的搜索 token |
| `index_hits` | number | 索引文档命中数 |
| `source_entries` | SourceEntry[] | 去重排序后的源文档指针，按 weight 降序。受 `max_entries` 截断 |
| `total_entries` | number | 截断前源文档总数，`source_entries.length` 可能小于此值 |
| `truncated` | boolean | 是否被 `max_entries` 截断，`true` 时可调大 `max_entries` 翻页 |
| `graph_expanded` | boolean | 是否触发了图谱扩展 |
| `graph_neighbors` | string[] | 图谱扩展的邻居关键词 |
| `fallback_used` | "none" \| "global_search" | 降级策略 |
| `dirty_blocks` | number | 索引文档 body 解析失败的个数 |
| `errors` | array | 错误列表 |
| `hint` | string? | 建议下一步操作 |

---

## 4. 并发策略

| 阶段 | 并发数 | 说明 |
|------|--------|------|
| 索引库搜索 | N（token 数）× M（索引库数） | 每个 token 在每个索引库独立并行搜 |
| 读索引文档 body | `search_concurrency`（默认 5） | 分批并发，由 config 控制 |
| 图谱扩展 | 串行 | listAllDocs 筛选分片 → 并发读 → 搜邻居索引库 |
| 全库降级 | N（token 数） | 每个 token 独立搜全库 |

> 并发数可通过配置文件 `search_concurrency` 或环境变量 `YUQUE_SEARCH_CONCURRENCY` 调整。

---

## 5. 图谱扩展（工具层自动）

### 5.1 触发条件

工具内部自动判断：`source_entries.length < 3` 时触发。

### 5.2 流程

```
1. listAllDocs(graph_book) → 筛选 graph\d+ 分片
2. 并发读全量分片 → 合并 neighbors
3. 查命中关键词的邻居 → Top 5
4. 对邻居关键词搜索引库 → 读索引文档 → 展开 entries
5. 与原有 source_entries 去重合并
6. 返回 graph_expanded=true + graph_neighbors
```

### 5.3 图数据格式

```json
{
  "shards": 2,
  "built_at": "2026-06-03T18:00:00Z"
}

// graph0（分片，每片 ≤ 200KB）
{
  "neighbors": {
    "SpringBoot": ["自动配置", "JPA", "Starter"],
    "Docker": ["K8s", "容器", "镜像"]
  }
}
```

> 图谱由索引构建完成后自动生成，详见 [knowledge.md](knowledge.md)。
> 图库未配置时图谱扩展静默跳过（不报错）。

---

## 6. 树搜索（Agent 层）

### 6.1 流程

```
工具返回的 source_entries 中，每个 entry 可能含 tree 字段。

⑥-a. 对每篇候选 entry：检查 entry.tree 字段
      ├─ 有 tree → 进入 ⑥-b
      └─ 无 tree → 降级读全文

⑥-b. LLM 读 tree.sections（仅标题+摘要，几十 token）
      → 判断哪些 section 与用户问题相关
      → 输出相关 section id 列表

⑥-c. 只读相关 section 的原文
      → 拼接后送 LLM 生成答案 + 引用
```

### 6.2 Tree 选择 Prompt

```
以下是一篇文档的章节树。根据用户问题，判断哪些章节与问题相关。

用户问题：{question}

章节树：
{tree_sections}

要求：
1. 只输出相关的 section id 列表（JSON 数组），如 ["s1", "s3"]
2. 如果所有章节都相关 → 输出全部 id
3. 如果都不相关 → 输出空数组 []
4. 不要输出任何其他内容
```

### 6.3 数据来源

`tree` 字段在索引构建时生成，工具层透传，详见 [knowledge.md](knowledge.md) 四、树搜索。