# 知识库搜索

基于 `yuque_kb_search` MCP 工具的两层索引搜索管道。

## 触发词

```
「搜索知识库」「查一下语雀」「语雀里有没有」
「搜文档」「找一下」「帮我查」
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

## 降级策略

```
索引管线搜索 0 命中
  ↓
二轮搜索：LLM 分析缺什么 → 生成新 token → 再跑 yuque_kb_search
  ↓ 仍不够
降级全库搜索：yuque_search 不传 scope → 语雀原生全库搜索
  ↓ 仍 0 命中
返回「未找到相关内容，请尝试换个问法」
```
