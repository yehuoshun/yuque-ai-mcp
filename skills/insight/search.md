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
  → 5 并发读索引文档 body
  → parseIndexDoc 解析 keywords / summary / entries
  → 展开 entries → did 去重合并
  → 返回 source_entries（源文档指针列表）
  ↓
③ 命中 0？→ 二轮搜新 token 或降级全库搜索
  ↓
④ 候选 > 5 篇？→ 用 summary + keywords → LLM 重排 → Top 5
  ↓
⑤ 5 并发 yuque_get_doc 读源文档原文 → LLM 生成答案 + 引用
```

### Token 生成 Prompt

```
将用户自然语言问题转换为 2-5 个独立搜索 token，每个 token 在语雀搜索 API 中单独并行查询。

要求：
1. 提取 2-5 个最核心的技术术语，每个 ≤1 个词
2. 覆盖不同角度：核心概念、同义表达、俗称、缩写、英文
3. 严禁符号、emoji——token 内部必须是纯字母/数字/中文
4. token 无空格（如 SpringBoot），代码层 cleanToken 自动清洗
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

## 索引构建（关键词中心）

**一个关键词 = 一篇索引文档。** 标题就是关键词本身，命中直接对得上。

### Phase 1 — 逐文档评分（v4 文档中心）

```
1. yuque_list_docs → 列出源库全部文档（标题 + ID）
2. 逐文档 yuque_get_doc 读 body → LLM 提取关键词 + 权重

   文档类型处理：
   - Markdown/代码可读 → 从正文提取关键词（1-5 个），w=1-10
   - Lake 乱码/附件/body 为空 → 降级标题提取，w=5
   - 代码文档 → 从 import/注解/类名/方法签名提取

3. 聚合去重 → **细粒度策略**：仅合并真正的同义不同名（如 "SpringBoot"="Spring Boot"），
   不合并语义不同的概念（Vue2≠Vue3≠前端，JWT≠JavaWeb≠MyBatis）。
   宁多勿少，每个微粒度关键词独立保留。

**⚠️ 容量提示**：细粒度关键词可能较多（168 个关键词/55 篇）。
子索引库文档数 > 200 或总库 > 300 时，需提示用户新建或扩容。
```

### Phase 2 — 逐关键词写入

```
对每个关键词：
1. LLM 汇总该关键词下所有 {did, w} → 生成 keywords[] + summary
2. 调 yuque_index_create(keyword, keywords, summary, entries, index_book_id)
3. 构建后验证：搜 2-3 个预期 query → 0 命中立即修复
```

### yuque_index_create 参数

| 参数 | 说明 |
|------|------|
| `keyword` | 索引关键词（直接用作文档标题，不含前缀符号） |
| `keywords` | 搜索面关键词数组 `string[]`（同义词/变体/缩写/口语问法） |
| `summary` | 摘要（100-200 字） |
| `entries` | 源文档指针数组 `[{did, ns, t?, s?, url?, w?}]` |
| `index_book_id` | 子索引库 book_id |

---

## 索引文档格式

标题：`{关键词}`（如 `SpringBoot`）——直接用关键词作标题，不加前缀

> ⚠️ 语雀搜索对符号匹配极差，标题不用 `[]` 等符号包裹。

```
关键词：["SpringBoot","SpringBoot启动","自动配置","EnableAutoConfiguration","条件装配"]

摘要：SpringBoot 通过 @EnableAutoConfiguration 实现自动配置，条件装配注解按 classpath 动态决定 Bean 注册。多数据源场景通过 @ConfigurationProperties 分别配置 DataSource。

entries：
[{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc"},{"did":591,"ns":"yehuoshun/dil9w3","t":"条件装配与多数据源","s":"def","url":"https://www.yuque.com/yehuoshun/dil9w3/def"}]
```

### keywords 规则

1. 核心词 + 同义词 + 缩写：中英文变体、驼峰形式、简写
2. 相关概念：该关键词涉及的下位概念、相关技术/工具/框架
3. 口语问法："xxx怎么用""xxx是什么""xxx不生效"等自然问句
4. 区分易混淆术语：如 Autowired 和 AutoConfiguration 是不同的概念
5. 搜索视角自检：用户不知道有这个文档，会用什么词搜？
6. 输出为 JSON 字符串数组，代码层 `cleanToken` 每元素去空格去符号
