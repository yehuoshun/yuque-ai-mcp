# 知识库搜索与索引构建

基于 `yuque_kb_search` 和 `yuque_index_create` 两个 MCP 工具的知识库搜索管道。

## 触发词

```
「搜索知识库」「查一下语雀」「语雀里有没有」
「搜文档」「找一下」「帮我查」
「建索引」「重建索引」「更新索引」「索引构建」
```

---

## 搜索流程

```
用户提问 "Spring事务怎么配"
  ↓
① LLM 生成 2-5 个搜索 token
  "Spring事务怎么配" → ["Spring", "事务", "Transactional"]
  ↓
② 调 yuque_kb_search(tokens, index_book_ns, index_book_id)
  → N 路并行搜索子索引库
  → doc_id 去重
  → 并发读索引文档 body
  → 解析 entries JSON
  → did 去重合并
  → 返回 source_entries（源文档指针列表）
  ↓
③ 命中 0？→ 二轮搜新 token 或降级全库搜索
  ↓
④ 候选 > 5 篇？→ 读 #摘要 → LLM 重排 → Top 5
  ↓
⑤ 并发 yuque_get_doc 读源文档原文 → LLM 生成答案 + 引用
```

### Token 生成 Prompt

```
将用户自然语言问题转换为 2-5 个独立搜索 token，每个 token 在语雀搜索 API 中单独并行查询。

要求：
1. 提取 2-5 个最核心的技术术语，每个 ≤1 个词
2. 覆盖不同角度：核心概念、同义表达、俗称、缩写、英文
3. 严禁空格、符号、emoji——token 内部必须是纯字母/数字/中文
4. 复合术语用无空格形式：SpringBoot 不用 Spring Boot
5. 禁止泛词："方法""怎么""搞""啥"等

用户问题：{question}

输出 JSON 数组：
["token1", "token2", ...]
```

### yuque_kb_search 参数

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

## 索引构建

### Phase 1 — 关键词规划

```
1. yuque_list_docs → 列出源库全部文档（标题 + ID）
2. LLM 扫全量标题 → 输出关键词清单 + 每篇文档的预分配

规划原则：
- 同一概念的多种表述合并为一个关键词
- 密集领域细分（>15 篇 → 拆分）
- 稀疏领域合并（<3 篇 → 合并）
- 每篇文档至少归属 1 个关键词
```

### Phase 2 — 逐关键词构建

```
对每个关键词：
1. yuque_get_doc 读关联源文档正文
2. LLM 判断拟合度（提到 Java ≠ Java 主题）
3. LLM 生成搜索面 + 摘要 + entries
4. 调 yuque_index_create(keyword, search_surface, summary, entries, index_book_id)
5. 构建后验证：搜 2-3 个预期 query → 0 命中立即修复
```

### yuque_index_create 参数

| 参数 | 说明 |
|------|------|
| `keyword` | 关键词（如 Spring、事务、JVM） |
| `search_surface` | 搜索面文本（LLM 生成，穷举同义词/缩写/口语问法） |
| `summary` | 摘要（100-200 字，LLM 生成） |
| `entries` | 源文档指针数组 [{did, bid, ns, t, s?, wc?}] |
| `index_book_id` | 子索引库 book_id |

---

## 索引文档格式

每篇索引文档 body 三层结构：

```
# 搜索面
核心词 + 同义词 + 缩写 + 相关概念 + 口语问法
（全部围绕一个关键词穷举）

# 摘要
100-200 字概括该关键词覆盖的源文档核心内容

{"e":[{"did":584,"bid":70910909,"ns":"yehuoshun/dil9w3","t":"Spring 事务管理"},...]}
```

### 搜索面规则

1. 核心词 + 同义词 + 缩写：中英文变体、驼峰形式、简写
2. 相关概念：该关键词涉及的下位概念、相关技术/工具/框架
3. 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
4. 区分易混淆术语：如 Autowired 和 AutoConfiguration 是不同的概念
5. 搜索视角自检：用户不知道有这个文档，会用什么词搜？