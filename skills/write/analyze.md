# 风格分析（analyze）

分析单篇或对比多篇文档的写作风格，输出 10 维风格画像。

## 触发词

```
「分析一下这篇的写作风格」「我的文风是什么」「风格画像」
「分析这两篇的风格差异」
```

---

## 输入

```
单篇模式：
  文档名/doc_id → yuque_get_doc 读 body → LLM 分析

对比模式：
  「分析这两篇的风格差异」→ 读两篇 → 对比分析

知识库模式：
  「分析{知识库}的写作风格」→ list_docs → 抽 N 篇 → 聚合分析 → 输出整体风格画像
```

---

## 风格画像维度（10 维）

```
{
  "tone": "正式/口语/幽默/严肃/讽刺/温情",
  "sentence_length": "短句为主/中长句/长句为主/混合",
  "vocabulary_level": "通俗/专业/学术/混杂",
  "structure_preference": "总分总/递进/并列/散点/叙事",
  "signature_patterns": ["爱用设问开头", "每段≤3句", "大量类比"],
  "paragraph_density": "稀疏(>5句/段)/适中(3-5句)/密集(≤3句)",
  "punctuation_traits": "多用破折号/爱用省略号/感叹号频繁/严谨规范",
  "quote_frequency": "频繁引用/偶尔引用/从不引用",
  "example_density": "每段举例/关键处举例/很少举例",
  "emotional_level": "冷静客观/温和克制/激情外露/讽刺调侃"
}
```

---

## Prompt 模板

```
分析以下文档的写作风格，输出 JSON。只输出 JSON，不要额外文字。

维度说明：
- tone: 语气基调
- sentence_length: 句式长度偏好
- vocabulary_level: 用词层次
- structure_preference: 结构偏好
- signature_patterns: 标志性写作习惯（字符串数组）
- paragraph_density: 段落密度
- punctuation_traits: 标点特征
- quote_frequency: 引用频率
- example_density: 举例密度
- emotional_level: 情感强度

文档正文：
{body}

输出 JSON：
```

---

## 输出格式

```
## 🔍 写作风格画像：《{title}》

| 维度 | 分析 |
|------|------|
| 语气 | 正式严谨 |
| 句式 | 中长句为主，偶尔短句破节奏 |
| 用词 | 专业技术词汇，少量口语化表达 |
| 结构 | 总分总，先抛结论再展开 |
| 标志习惯 | 每段以设问开头；喜欢用「换句话说」做补充 |
| 段落 | 适中（3-5句/段） |
| 标点 | 规范，少用感叹号 |
| 引用 | 偶尔引用外部资料 |
| 举例 | 关键概念处必举例 |
| 情感 | 冷静客观 |

### 🎯 一句话总结
{一句话风格概述}

{对比模式：额外输出差异分析表}
```

---

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 读文档 | `yuque_get_doc` |
| 列出文档 | `yuque_list_docs` |
| 生成 | LLM（本 Agent） |