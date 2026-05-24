# 文档版本审计 & 变更追踪（batch-version-audit）

利用 `yuque_list_doc_versions` / `yuque_get_doc_version`（官方 MCP 没有的能力），提供变更日报、单篇历史、版本对比、协作追踪四个只读场景。

> ⚠️ 必须指定知识库，不支持全库扫描。

## 触发

```
变更日报：「今天《XX》有哪些文档被改了」「《XX》本周变更报告」
单篇历史：「《XX文档》的版本历史」「《XX》改了多少版」
版本对比：「对比《XX》的第N版和第M版」「《XX》v3和v5有什么区别」
协作追踪：「谁改了《XX》」「《XX库》的变更记录」
```

---

## 四个场景（全部只读）

| 场景 | 做什么 | 输出 |
|------|--------|------|
| 变更日报 | 指定时间段的文档变更汇总 | 变更列表 + 每篇版本数 |
| 单篇历史 | 单篇文档的完整版本时间线 | 版本列表 + 变更人 + 时间 |
| 版本对比 | 两个版本的内容 diff | 章节变化 + 内容差异 + 格式改进 |
| 协作追踪 | 成员的变更统计 | 排行榜 + 文档参与度 |

---

## 场景一：变更日报

### 流程

```
1. yuque_list_repos → 匹配源库（必须指定）

2. yuque_list_docs(book_id=源库id) → 全部文档
   提取：title | slug | id | updated_at
   count == 0 → 告知，结束
   count > 50 → 分批 50 篇/批

3. 并发 3 篇：
   每篇 → yuque_list_doc_versions(doc_id=id)
   筛选 updated_at 在指定时间段内的版本
   记录：title、最后变更时间、该时段版本数

4. 汇总 → 按变更时间降序
```

### 输出

```
📋 变更日报 — 《技术笔记》
时间：2026-05-23（今天）

变更文档：{n} 篇

 #  文档          最新变更     今日版本数
 1  {title}      {time}       {n}
 2  {title}      {time}       {n}
 ...

知识库：https://www.yuque.com/{namespace}
```

---

## 场景二：单篇版本历史

### 流程

```
1. yuque_list_docs(namespace) 搜文档标题 or 用户直接给 slug
   → 拿到数字 id

2. yuque_list_doc_versions(doc_id=id) → 全部版本
   version_id | updated_at | 变更人

3. 展示时间线
```

### 输出

```
📜 版本历史 — 《{title}》
当前版本：v{current} | 共 {n} 个版本

 #  版本    时间          变更人
 {n} v{n}   {time}       {user}  ← 当前
 ...
 1   v1     {time}       {user}

操作：
  「对比 v{N} 和 v{M}」— 版本 diff
  「对比最近两版」— 看最新变更
```

---

## 场景三：版本对比

### 流程

```
1. 用户指定文档 + 两个版本号
2. yuque_get_doc(namespace, slug) → 拿到数字 id
3. yuque_get_doc_version(version_id=A) → body_A
4. yuque_get_doc_version(version_id=B) → body_B

3. LLM 对比 → 变更摘要：
   - 结构变化（新增/删除章节）
   - 内容变化（关键数值、术语、论述的改动）
   - 格式变化（代码块、列表、排版）
```

### 输出

```
🔍 版本对比 — 《{title}》v{A} → v{B}
时间跨度：{date_A} → {date_B}（{n} 天）

📊 变更概要：
  新增 {x} 字 | 删除 {y} 字 | 净增 {z} 字

➕ 新增章节：
  • {chapter}

➖ 删除章节：
  • {chapter}

📝 关键变更：
  • {change}

✏️ 格式改进：
  • {change}
```

---

## 场景四：协作追踪

### 流程

```
1. yuque_list_repos → 匹配源库（必须指定）

2. yuque_list_docs → 全部文档
   提取：title | slug | id | updated_at
   count > 50 → 分批 50 篇

3. 并发 3 篇：
   每篇 → yuque_list_doc_versions(namespace, slug)
   提取每版的变更人

4. 汇总统计：
   - 每个成员变更次数
   - 涉及文档数
   - 最后活跃时间
```

### 输出

```
👥 协作报告 — 《{源库名}》
时间范围：{start} → {end}

成员变更统计：

  成员          变更次数    涉及文档  最后活跃
  {user}        {n}          {n}      {time}
  ...

变动最频繁文档：
  1. {title} — {n} 次变更，{k} 人参与
  2. {title} — {n} 次变更
  ...
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 未指定知识库 | 「请指定要审计的知识库」 |
| 源库为空 | 告知，结束 |
| 文档不存在 | 告知「未找到该文档」 |
| 无版本历史 | 告知「该文档暂无版本记录」 |
| 版本号不存在 | 告知可用版本范围 |
| 超 50 篇 | 分批 |
| API 限流(429) | 等 Retry-After，最多 3 次 |

---

## 依赖工具

`yuque_list_repos` / `yuque_list_docs` / `yuque_list_doc_versions` / `yuque_get_doc_version`

> 全部是官方 MCP 没有的独有能力。