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
count > 100 → 分页获取：offset 递增 100 直到取完，告用户总数后等确认
```

### 2.2 分批读取诊断（body 缓存复用）

每批 10 篇，并发 3 篇：

```
yuque_get_doc(book_id=源库id, doc_id=文档id) → body（Markdown / HTML / Lake）
→ 缓存 body 到内存（阶段三清洗时直接复用，不再调 API）

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
1. 标题：根据诊断结果处理
   - title_quality=clean → 保留原标题
   - title_quality=fixable → 生成干净标题（保留核心主题，去掉广告/编号垃圾）
   - title_quality=garbage → 从正文重新生成标题（原标题完全不可用）
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
  "keywords": ["关键词1", "关键词2"],
  "changes": ["去广告 1 处", "去掉 HTML 残留", "重构为 3 级标题"]
}

> keywords 为 3-8 个技术关键词，供后续分类阶段使用。
> 提取规则：技术术语/框架名/概念名，不用动词/形容词/通用词。
> 例：「Spring Boot 自动配置原理」→ ["SpringBoot", "自动配置", "AutoConfiguration"]
```

### 3.2 分类 Prompt 模板

每批清洗完成后，LLM 用以下 prompt 做增量分类：

```
你是一个知识库分类引擎。根据以下规则，将文档归入分类树。

## 已有分类树
{当前分类树 JSON，含每个类的文档数}

## 本批文档
{每篇：clean_title + keywords（清洗阶段输出的 3-8 个关键词）+ 前 200 字摘要}

> 关键词由清洗阶段提取，随 clean_title 一起传入，分类 LLM 直接使用无需重复提取。

## 分类规则（严格按优先级执行）

【1. 关键词提取】
本批文档已附带清洗阶段提取的关键词（3-8 个技术关键词/篇），直接使用。
不要重新提取。

【2. 类名匹配（按关键词重叠数判定）】
- 关键词重叠 >= 3 个 → 直接归入该类（高置信度，不犹豫）
- 关键词重叠 1-2 个 → 判断语义是否同主题：
  - 同主题（如「HashMap」和「ConcurrentHashMap」都属 Java 集合）→ 归入
  - 不同主题（如「Docker」和「Docker Compose」关键词重叠但属不同粒度）→ 可能归入或新建，看类大小
- 关键词重叠 0 个 → 新建类

【3. 类大小控制（硬门槛）】
- < 2 篇 → 强制合并：找关键词重叠最多的已有类，归入。不保留孤类
- 2-10 篇 → 正常，保持
- 11-20 篇 → 标记「偏大」，记录在案，全局调优时检视是否需拆分
- > 20 篇 → 强制细分：提取该类下所有文档的二级关键词，按二级关键词聚类拆成 2-3 个子类

【4. 目录深度】
- 默认 2 层（一级类 → 二级类）
- 一级类 > 10 篇 且 子主题明确可分 → 允许 3 层
- 禁止超过 3 层

【5. 命名规范】
- 类名 = 该类下文档最高频的技术关键词（2-6 字）
- 禁止用元信息词做类名：「教程」「笔记」「参考」「资料」「文档」「合集」「汇总」
- 禁止用序号：「Java1」「Java2」「前端A」「前端B」
- 禁止用模糊词：「其他」「杂项」「未分类」「待整理」「临时」
- 好例子：「SpringBoot」「JVM调优」「MySQL索引」「React Hooks」
- 坏例子：「Java教程」「前端资料」「其他杂项」「Docker相关」

【6. 多目录判定】
一篇文档可以属于多个分类，当且仅当：
- 文档核心主题跨两个独立领域（如「MySQL + Redis 缓存方案」→ 主「MySQL」副「Redis」）
- 最多 2 个分类（主 + 副）
- 不是「有点关系就挂」——必须内容有实质性交叉

【输出格式】严格 JSON，不要 Markdown 代码块包裹：
{
  "categories": [
    {
      "name": "一级类名",
      "doc_count": 12,
      "keywords": ["该类最高频关键词"],
      "children": [
        { "name": "二级类名", "doc_count": 5, "keywords": [...] }
      ]
    }
  ],
  "assignments": [
    {
      "doc_id": 123,
      "clean_title": "...",
      "keywords": ["提取的关键词"],
      "primary_category": ["一级", "二级"],
      "secondary_categories": [],
      "match_reason": "关键词重叠 3 个: SpringBoot, 自动配置, AutoConfiguration"
    }
  ]
}
```

### 3.3 执行（每批即洗即分，复用诊断缓存）

每批 10 篇，清洗和分类同批完成。body 从阶段二缓存读取，不重复调 API：

```
for 每批 10 篇：
  // 3.3a 并发清洗（5 篇并发，LLM 推理较重）
  body_cache[doc_id] → LLM 清洗 → { clean_title, clean_body, changes }

  // 3.3b 本批分类（清洗完立即分类）
  LLM 按 3.2 prompt 模板 → { categories, assignments }
  → 增量合并到全局分类树

单篇 LLM 失败 → 标记「清洗失败」，保留原文
全批失败 → 中止，告知原因
```

### 3.4 全局调优

> 增量阶段已在尽力维护规则（<2 强制合并、>20 强制细分），
> 但全局数据量下可能有遗漏。此阶段用全量数据做最终确认。

全部批次处理完后，LLM 做一次全局检查：

```
输入：最终分类树（所有类别 + 每类文档数 + 每类关键词列表）

LLM 逐项检查（增量阶段已处理的不再重复，仅查遗漏）：

1. 孤类二次确认
   遍历所有类，doc_count < 2 → 合并到关键词重叠最多的类
   （增量阶段已合并，此处仅二次确认）

2. 大类别二次确认
   遍历所有类，doc_count > 20 → 确认是否已拆分
   未拆分 → 按二级关键词聚类拆成 2-3 个子类
   （增量阶段已拆分，此处仅二次确认）

3. 语义重复合并
   两两比较所有同级类名 + 关键词列表：
   - 类名完全相同 → 合并
   - 关键词重叠数 ≥ 任意一方关键词数的 50% → LLM 判断是否同义
     （如「容器」和「Docker」关键词 50% 重叠 → 合并为「Docker」）
   - 否则保留

4. 命名审计
   逐类检查类名：
   - 含元信息词（教程/笔记/资料等）→ 用该类最高频关键词替换
   - 含序号（1/2/A/B）→ 去掉序号，用关键词区分
   - 含模糊词（其他/杂项/未分类）→ 用该类最高频关键词替换
   - 不在 2-6 字范围 → 调整

5. 深度审计
   - 一级类 > 10 篇 且 子主题明确 → 允许 3 层，否则压到 2 层
   - 存在第 4 层 → 上提一级

输出：优化后的分类树 + 变更说明（做了什么改动、为什么）
```

### 3.5 预览

用户操作直接影响后续流程：
- 「确认」→ 以当前分类树进阶段四
- 「改名/合并/拆分/排除」→ 更新分类树，重新展示预览，再次确认
- 「取消」→ 结束

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
  → slug 生成规则：{源库slug}-purified-{时间戳秒}（如 java-notes-purified-1714473600）
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

    for 每个三级分类（如有）：
      yuque_update_toc(action: "appendNode", action_mode: "child", type: "TITLE", title: "三级名", target_uuid: 二级UUID)
      → 得到三级节点 UUID，记入内存缓存

目录缓存结构：
  {
    "一级名": {
      uuid: "...",
      children: {
        "二级名": {
          uuid: "...",
          children: {
            "三级名": { uuid: "..." }  // ≤3 层
          }
        }
      }
    }
  }

后续写文档时按分类路径从缓存查 target_uuid，不再调 API。
```

### 4.2 逐篇写入 + 精准挂载

> 目录缓存结构：`{ "一级类名": { uuid, children: { "二级类名": { uuid } } } }`
> 按分类路径查缓存：`cache["一级"]["children"]["二级"]["uuid"]`

```
for 每篇文档（按分类分组，同分类内串行，不同分类并发 3）：

  // 按分类路径从目录缓存查 TITLE 节点 UUID
  // 例：primary_category = ["Java", "集合"]
  //   → primary_uuid = toc_cache["Java"]["children"]["集合"]["uuid"]
  primary_uuid = toc_cache[一级][children][二级][uuid]

  // 创建文档 + 精准挂载（一步到位）
  yuque_create_doc(
    book_id=目标库id,
    title=clean_title,
    body=clean_body,
    target_uuid=primary_uuid,    // 精准挂载到目标分类节点
    action_mode="child"
  )
  → 得到 doc_id

  // 多目录？复制到副分类（副分类 UUID 同样从 toc_cache 按路径查找）
  if secondary_categories:
    for each sec_cat in secondary_categories:
      sec_uuid = toc_cache[sec_cat[0]]["children"][sec_cat[1]]["uuid"]
    yuque_clone_doc_to_toc(
      book_id=目标库id,
      doc_id=doc_id,
      target_uuids=[sec_uuid1, sec_uuid2, ...]
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

// 期望数 = (total - skip) + 副分类副本数
成功数 != 期望数 → 列出缺失文档，告用户

yuque_get_toc_flat(book_id=目标库id) → 对比分类树：
  - 每个分类节点的文档数 ≈ 分类树预期（±2 容差）
  - 无孤儿文档（不在任何目录节点下）
  - 无空 TITLE 节点（有节点无文档）
  → 不一致则逐项告警
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
| 超 100 篇 | 分页获取全部文档后正常处理 |
| 全部文档 skip | 告知「所有文档均被跳过，无内容可写入」，结束 |
| LLM 清洗/分类失败 | 重试 1 次，仍失败用原文 |
| 目标库创建失败 | 中止 |
| 单篇创建失败 | 记录，继续 |
| 多目录复制失败 | 记录，不阻断主流程 |
| API 限流(429) | 等 Retry-After，最多 3 次 |
| 目录节点创建失败 | 重试，仍失败标记该分类所有文档为 failed |

### API 成本估算

| 操作 | 每篇 API 调用 | 说明 |
|------|-------------|------|
| 诊断 | 1 次 `get_doc` | body 缓存复用 |
| 清洗 | 0 次 API（复用缓存） | 仅 LLM 推理 |
| 分类 | 0 次 API | 仅 LLM 推理 |
| 写入 | 1 次 `create_doc` | 含精准挂载 |
| 多目录 | +1 次 `create_doc`/副分类 | 物理复制，每个副分类多一篇文档 |
| **总计** | **1 + 副分类数 次/篇** | 100 篇 ≈ 100-130 次 API |

> ⚠️ 多目录会物理复制文档，目标库文档数 = 源库文档数 + 副分类副本数。
> 例：100 篇中有 10 篇双目录 → 目标库 110 篇文档。

### 已知限制

| 限制 | 影响 | 缓解 |
|------|------|------|
| 图片 URL | 源文档图片链接在新库可能 403（私有库跨库引用） | 清洗后保留原始 URL，用户自行处理 |
| 文档 slug 冲突 | 多篇同名文档可能 slug 碰撞 | `yuque_create_doc` 语雀自动追加后缀 |
| 附件 | 文档内附件链接不会自动迁移 | 不在本次范围，需单独处理 |
| 断点续传 | 写入阶段中断后无法从断点恢复 | 小库（<50 篇）重跑，大库考虑拆分 |

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
