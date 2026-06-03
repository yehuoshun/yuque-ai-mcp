# 知识库搜索

基于 `yuque_kb_search` MCP 工具的两层索引搜索管道。

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
② 调 yuque_kb_search(tokens)
  → N 路并行搜总库 → 找关键词路由文档
  → 路由文档 body 解析出 [{book_id, namespace}]，namespace 是文档级路径（group/slug/slug）
  → 直接按文档级 namespace 读索引文档（不再搜子库）
  → parseIndexDoc 解析 keywords / summary / entries
  → 展开 entries → doc_id 去重合并
  → 返回 source_entries（源文档指针列表）
  ↓
②.5 图谱扩展（条件触发，见 §5）
  → yuque_kb_search(["_graph"]) 找图谱文档
  → 命中关键词的 1 跳邻居（权重 Top 5）
  → 补搜邻居关键词的索引文档
  → 展开新 entries → 去重合并
  ↓
③ 命中 0？→ 二轮搜新 token 或降级全库搜索
  ↓
④ 候选 > 5 篇？→ 用 summary + keywords → LLM 重排 → Top 5
  ↓
⑤ 树搜索读原文（见 §6）
  → 对每篇候选：检查 entry 有无 tree 字段
  → 有 tree → LLM 读 tree.sections 选相关章节 → 只读相关章节原文
  → 无 tree → 降级读全文
  → LLM 生成答案 + 引用
```

### 1.1 为什么独立 token 并行而不是 AND 查询

- 语雀搜索 API 对多 token 做 AND 匹配："前端 部署" 要求两词同时出现在同一文档 → 极易 0 命中
- 独立 token 并行：["前端"] + ["部署"] 各自搜 → 每个 token 独立命中 → 去重合并
- 实测：AND 模式命中率 73%，独立 token 并行 **100%**（15/15）
- 每个 token 独立命中后，LLM 重排筛选保证准确率

### 1.2 降级策略

```
索引管线搜索 0 命中
  ↓
二轮搜索：LLM 分析缺什么 → 生成新 token → 再跑 yuque_kb_search
  ↓ 仍不够
降级全库搜索：yuque_search 不传 scope → 语雀原生全库搜索
  ↓ 仍 0 命中
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
2. 覆盖不同角度：核心概念、同义表达、俗称、缩写
3. 严禁符号、emoji——token 内部必须是纯字母/数字/中文
4. token 无空格（如 SpringBoot），代码层 cleanToken 自动清洗
5. 禁止泛词："方法""怎么""搞""啥"等

用户问题：{question}

输出 JSON 数组：
["token1", "token2", ...]
```

### 2.2 重排序 Prompt

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

| 参数 | 说明 |
|------|------|
| `tokens` | 搜索 token 数组（LLM 生成） |
| `index_book_ns` | 子索引库 namespace（如 yehuoshun/idx-misc-1） |
| `index_book_id` | 子索引库 book_id |

### 子索引库选择

先通过域名判断：
- Java / Spring / JVM 相关 → idx-java-1 (79349679)
- Python / Django / Flask → idx-python-1 (79350288)
- 其他 / 不确定 → idx-misc-1 (79350299)

> 域名判断由 LLM 根据用户问题内容推断。不确定时默认走 idx-misc-1。

---

## 4. 并发策略

| 阶段 | 并发数 | 说明 |
|------|--------|------|
| 搜索子索引库 | N（token 数） | 每个 token 独立并行搜，结果去重合并 |
| 读索引文档 body | `search_concurrency`（默认 5） | 分批并发 yuque_get_doc，由 config 控制 |
| 重排序 | - | LLM 单次调用，直接用 summary 字段 |
| 读源文档原文 | `search_concurrency`（默认 5） | 并发 yuque_get_doc |

> 并发数可通过配置文件 `search_concurrency` 或环境变量 `YUQUE_SEARCH_CONCURRENCY` 调整。

---

## 5. 图谱扩展

### 5.1 触发条件

满足以下任一条件时触发：

| 条件 | 逻辑 |
|------|------|
| 直接命中 < 3 篇 | 候选太少，图扩展补量 |
| 用户问题涉及「关系」「对比」「关联」「相关」 | 语义上需要关联知识 |
| 子索引库存在 `_graph` 文档且 `built_at` 距今 ≤ 30 天 | 图数据可用 |

### 5.2 流程

```
1. yuque_kb_search(["_graph"], ...) → 找 _graph 文档
   → 不存在或过期 → 跳过图扩展
2. yuque_get_doc → 读完整 JSON（nodes + edges + communities）
3. 提取命中关键词的 1 跳邻居，按边权重降序取 Top 5
4. 对每个邻居关键词：yuque_kb_search([neighbor], ...)
   → 搜邻居的索引文档 → 展开 entries
5. 与原有 source_entries 去重合并
6. 进入重排阶段
```

### 5.3 不触发时

跳过此步，直接进入步骤 ③。

---

## 6. 树搜索

### 6.1 流程

```
⑤-a. 对每篇候选 entry：检查有无 tree 字段
      ├─ 有 tree → 进入 ⑤-b
      └─ 无 tree → 降级读全文

⑤-b. LLM 读 tree.sections（仅标题+摘要，几十 token）
      → 判断哪些 section 与用户问题相关
      → 输出相关 section id 列表

⑤-c. 只读相关 section 的原文
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

`tree` 字段在索引构建时生成，详见 [knowledge.md](knowledge.md) 四、树搜索。
