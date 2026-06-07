# 知识库净化（kb-purify）

将混乱的知识库整体清洗后输出到新知识库。区别于 `classify`（从零分类）和 `archive`（按时间搬移），**purify 深入内容层**：清洗文档内容、重构结构、去广告/HTML垃圾、生成干净标题，再写入新库。

## 触发词

```
「净化《XX》」「清洗《XX》」「整理《XX》的知识库」「把《XX》洗干净放到《YY》」
「《XX》太乱了帮我净化一下」「清理《XX》的垃圾内容」
```

## 和现有 skill 的区别

| | classify | rebuild-toc | archive | **purify** |
|---|---|---|---|---|
| 处理内容 | ❌ | ❌ | ❌ | ✅ 去广告/HTML垃圾/重构结构 |
| 处理标题 | 不改 | 不改 | 不改 | ✅ LLM 生成干净标题 |
| 目录 | 从零分类 | 保留意图优化 | 移动旧文档 | ✅ LLM 分类 + 精准挂载 |
| 输出 | 源库或新库 | 源库或新库 | 归档库 | ✅ 始终输出到新库 |
| 多目录 | ❌ | ❌ | ❌ | ✅ 支持 |

---

## 参数解析

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| 源库 | ✅ | — | 名称 / book_id / slug / namespace |
| 目标库 | ❌ | 「{源库名}-净化版」 | 同上 |
| 批次大小 | ❌ | 10 篇/批 | 清洗+分类并发处理，每批即洗即分 |

---

## 阶段一：定位库

```
yuque_list_repos → 匹配：

  纯数字              → id 精确
  含 /（group/slug）   → namespace 精确
  纯英文/字母数字       → slug 精确
  含中文/混合          → 优先 slug 精确 → 未命中 name 模糊

唯一匹配 → 确认 | 多个匹配 → 让用户选 | 无匹配 → 告知不存在，结束
```

---

## 阶段二：扫描 & 诊断

### 2.1 获取文档列表

```
yuque_list_docs(book_id=源库id) → 全部文档
提取：title | slug | id | updated_at | word_count

count == 0 →「《XXX》是空的」结束
count > 100 → 警告「共 {n} 篇，较大，建议分批处理」，等用户确认
```

### 2.2 分批读取诊断

每批 10 篇，并发 3 篇：

```
yuque_get_doc(book_id=源库id, doc_id=文档id) → body（Markdown / HTML / Lake）

LLM 逐篇诊断，输出：
{
  "doc_id": 123,
  "title_quality": "clean" | "fixable" | "garbage",
  "title_suggestion": "干净标题建议",
  "content_issues": ["广告", "导航垃圾", "HTML残留", "结构混乱", "空内容", "剪藏垃圾"],
  "severity": "clean" | "light" | "heavy",
  "action": "keep" | "clean" | "skip"
}
```

诊断标准：

| 问题 | 判定 |
|------|------|
| 广告 | 含推广链接、产品推销、无关推广段落 |
| 导航垃圾 | 含"上一篇/下一篇/返回首页/目录"等导航文字 |
| HTML 残留 | 含 `<div>` `<span>` `style=` 等 HTML 标签碎片 |
| 结构混乱 | 无标题层级、标题跳跃（h1→h3）、段落过长无分段 |
| 空内容 | body 为空或 ≤10 字无意义内容 |
| 剪藏垃圾 | 含"来自 XXX""原文链接""阅读原文"等剪藏工具痕迹 |

### 2.3 输出诊断报告

```
📊 《{源库名}》诊断报告

文档总数：{n}
✅ 无需处理：{clean} 篇（{pct}%）
🔧 需要清洗：{fixable} 篇（{pct}%）
⏭️ 建议跳过：{skip} 篇（{pct}%）— {原因汇总}

问题分布：
  • 广告/推广：{n} 篇
  • 导航垃圾：{n} 篇
  • HTML 残留：{n} 篇
  • 结构混乱：{n} 篇
  • 剪藏垃圾：{n} 篇
  • 标题需修复：{n} 篇

skip 详情：
  {逐篇列出 skip 原因}

继续？
  「确认」— 进入清洗阶段
  「排除 {N}号,{M}号」— 跳过指定文档
  「全部清洗」— 连 clean 的也重新过一遍
  「取消」
```

---

## 阶段三：清洗 + 渐进式分类

### 3.1 清洗规则

每篇文档 LLM 处理，输出干净 Markdown：

```
原始标题：{原标题}
原始正文：{原body}

清洗要求：
1. 标题：若 title_quality=fixed，生成干净标题（保留核心主题，去掉广告/编号垃圾）
2. 去广告：删除推广段落、产品链接、无关推销
3. 去导航：删除"上一篇/下一篇/返回首页/目录/来源/原文链接"等
4. 去剪藏痕迹：删除"来自 XXX""阅读原文""本文由 XX 发布"
5. 去 HTML 残留：`<div>` `<span>` `style=` 等转为纯 Markdown
6. 重构结构：自动生成 h1-h3 层级、拆分过长段落、代码块用 ``` 包裹
7. 保留核心内容：不改变原意、不删减有价值信息

输出严格 JSON（不要代码块包裹）：
{
  "clean_title": "新标题",
  "clean_body": "清洗后的 Markdown",
  "changes": ["去广告 1 处", "去掉 HTML 残留", "重构为 3 级标题"]
}
```

### 3.2 执行（清洗 + 分类并行，每批即洗即分）

每批 10 篇，清洗和分类同批完成：

```
for 每批 10 篇：
  // 3.2a 并发清洗（5 篇并发，LLM 推理较重）
  yuque_get_doc × 10 → LLM 清洗 → { clean_title, clean_body, changes }

  // 3.2b 本批分类（清洗完立即分类，不等到全部结束）
  LLM 输入：{已有分类树} + {本批 clean_title + 前 200 字摘要}
  LLM 输出：{更新后的分类树 + 本批归属}
  → 增量合并到全局分类树

单篇 LLM 失败 → 标记「清洗失败」，保留原文
全批失败 → 中止，告知原因
```

增量合并规则：
- 新文档匹配已有类 → 直接归入
- 新文档不匹配任何类 → 新建类
- 已有类过小（<2 篇）→ LLM 决定合并或保留
- 已有类过大（>20 篇）→ LLM 细分

### 3.3 全局调优

全部批次处理完后，LLM 做一次全局优化：

```
输入：最终分类树（所有类别 + 文档数）

LLM 检查：
  • 是否有语义重复的类名（如「容器」和「Docker」→ 合并）
  • 是否有粒度不均（一类 30 篇 vs 一类 2 篇 → 拆分大/合并小）
  • 是否有命名不清晰（「其他相关」→ 改成具体名称）
  • 类名是否在 2-6 字范围内

输出：优化后的分类树
```

### 3.4 预览

```
📋 净化方案预览

来源：《{源库名}》（{total} 篇）→ 目标：《{目标库名}》（新建）
处理：清洗 {fixable} 篇 | 沿用 {clean} 篇 | 跳过 {skip} 篇

新目录结构（{batches} 批处理，{categories} 个分类）：

  ├─ {一级1}（{n1} 篇）
  │  ∟ {二级1}（{n} 篇）
  │  ∟ ...
  ├─ {一级2}（{n2} 篇）
  │  ∟ ...
  └─ ...

多目录文档：{n} 篇（标注在多个分类下，每处复制一份）
  例：「{title}」→ 主：{一级/二级}，副：{一级/三级}

{如有 skip → ⚠️ 跳过 {n} 篇将不写入新库}

操作：
  「确认」— 开始写入新库
  「改名 {旧}→{新}」— 调整分类名
  「合并 {A}+{B}」— 合并分类
  「拆分 {A}」— 拆分过大分类
  「排除 {分类名}」— 跳过整类
  「取消」
```

---

## 阶段四：执行写入

### 4.0 前置

```
目标库需新建 → yuque_create_repo(name="{源库名}-净化版", slug)
  → 响应不包含 namespace，手动构造：namespace = "{login}/{slug}"
  → login 从 config 的 group 字段取
  → 失败 → 中止

yuque_get_toc_flat(book_id=目标库id) → 初始为空
```

### 4.1 构建目录骨架

```
按分类树逐层创建 TITLE 节点：

for 每个一级分类：
  yuque_update_toc(action: "appendNode", action_mode: "sibling", type: "TITLE", title: "一级名", target_uuid: "")
  → 得到一级节点 UUID，记入内存缓存

  for 每个二级分类：
    yuque_update_toc(action: "appendNode", action_mode: "child", type: "TITLE", title: "二级名", target_uuid: 一级UUID)
    → 得到二级节点 UUID，记入内存缓存

目录缓存维护：每创建一个节点，更新本地 uuid→{title, type, children} 映射。
后续写文档时直接从缓存查 target_uuid，不再调 API。
```

### 4.2 逐篇写入 + 精准挂载

```
for 每篇文档（按分类分组，同分类内串行，不同分类并发 3）：

  // 查目录缓存，定位主分类的 TITLE 节点 UUID
  primary_uuid = toc_cache[分类路径]

  // 创建文档 + 精准挂载（一步到位）
  yuque_create_doc(
    book_id=目标库id,
    title=clean_title,
    body=clean_body,
    target_uuid=primary_uuid,    // 精准挂载到目标分类节点
    action_mode="child"
  )
  → 得到 doc_id

  // 多目录？复制到副分类
  if secondary_categories:
    yuque_clone_doc_to_toc(
      book_id=目标库id,
      doc_id=doc_id,
      target_uuids=[副分类1的UUID, 副分类2的UUID]
    )
    → 每个副本的 new_doc_id 记录到报告
```

**并发控制：**
- 同分类内串行（避免目录节点冲突）
- 不同分类间并发 3（加速）
- API 限流 429 → 等 Retry-After，重试 3 次
- 单篇失败 → 记录，继续

### 4.3 验证

```
yuque_list_docs(book_id=目标库id) → 统计实际写入数

成功数 != 期望数 → 告用户「期望 {expect} 篇，实际写入 {actual} 篇」

yuque_get_toc_flat(book_id=目标库id) → 验证目录结构
对比分类树预期 → 不一致则告警
```

---

## 阶段五：报告

```
✅ 知识库净化完成

来源：《{源库名}》（{total} 篇）
目标：《{目标库名}》
链接：https://www.yuque.com/{namespace}
时间：{现在}

📊 统计
  清洗 {fixable} 篇（{changes_detail}）
  沿用 {clean} 篇
  跳过 {skip} 篇
  写入成功 {success} 篇 | 失败 {failed} 篇

🏗️ 新结构
  {m} 大分类 | {k} 子类 | ≤3 层
  多目录文档：{n} 篇

{如有失败：}
❌ 失败详情：
  • {title} — {原因}

📝 清洗亮点：
  • 去掉 {ad_count} 处广告
  • 清理 {html_count} 处 HTML 残留
  • 重构 {struct_count} 篇文档结构
  • 修复 {title_count} 个标题

💡 源库：《{源库名}》原文未动，可对比验证后自行清理
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 源库不存在 | 告知，结束 |
| 源库为空 | 告知，结束 |
| 超 100 篇 | 警告，等用户确认 |
| LLM 清洗/分类失败 | 重试 1 次，仍失败用原文 |
| 目标库创建失败 | 中止 |
| 单篇创建失败 | 记录，继续 |
| 多目录挂载失败 | 记录，不阻断主流程 |
| API 限流(429) | 等 Retry-After，最多 3 次 |
| 目录节点创建失败 | 重试，仍失败标记该分类所有文档为 failed |

---

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 定位库 | `yuque_list_repos` |
| 扫描 | `yuque_list_docs` `yuque_get_doc` |
| 目标库 | `yuque_create_repo` |
| 目录骨架 | `yuque_update_toc` |
| 创建文档 | `yuque_create_doc`（带 target_uuid） |
| 多目录 | `yuque_clone_doc_to_toc` |
| 目录缓存 | `yuque_get_toc_flat` |
| 验证 | `yuque_list_docs` `yuque_get_toc_flat` |
