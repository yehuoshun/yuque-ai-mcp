# 外部文档导入（import）

从本地文件夹/ZIP 压缩包批量导入语雀知识库，自动适配 Markdown 变体格式、上传图片、按原目录结构建 TOC。

## 触发词

```
「导入」「导入到语雀」「把文件夹导入」「导入这个目录」
```

---

## 前置配置

```
config/yuque-config.json 需要 cookie + ctoken（图片上传用）：

{
  "token": "...",
  "group": "yehuoshun",
  "default_book": { ... },
  "cookie": "_yuque_session=xxx; yuque_ctoken=xxx",
  "ctoken": "xxx"
}

获取方式：
  浏览器打开 yuque.com 登录 → F12 → Application → Cookies
  → 复制 _yuque_session 和 yuque_ctoken 的值
  → cookie 字段填完整 Cookie 字符串
  → ctoken 字段填 yuque_ctoken 的值

⚠️ cookie 会过期，过期后需重新获取。
运行前检测：无 cookie → 提示配置后重试。
```

---

## 附件处理

`yuque_import_doc` 已内置全类型处理：

| 文件类型 | `yuque_import_doc` 行为 |
|---------|----------------------|
| Markdown（.md） | regex 适配 + 内嵌图片上传 CDN + 创建文档 |
| 代码/文本（.py .json .csv …） | 识别语言 → 包代码块 → 创建文档 |
| 图片（.png .jpg …） | 上传 CDN → 创建文档（嵌入 `![]()` ) |
| 其他（.pdf .docx .mp4 .zip …） | 上传附件 → 创建文档（`📎 [文件名](CDN链接)` ) |

Agent 只需逐文件调 `yuque_import_doc`，tool 内部自动分流。

### 纯文本文件处理

以下扩展名当天直接 `read` 创建文档：

| 类型 | 扩展名 | 文档格式 |
|------|--------|---------|
| 代码 | .py .js .ts .java .rb .go .rs .swift .cpp .hpp .c .h .cs .php .lua .scala .groovy .kt .dart .m .mm .sql .sh .bash .zsh .ps1 .bat .cmd | ` ```lang ` 代码块 |
| Web | .html .htm .css .scss .less .sass .xml .svg | ` ```lang ` 代码块 |
| 配置/数据 | .json .yaml .yml .toml .ini .cfg .conf .properties .env .csv .tsv | ` ```lang ` 代码块 |
| 标记 | .rst .tex .textile | 直接 body |
| 纯文本 | .txt .log .nfo .diff .patch | 直接 body |

### 纯文本导入规则

```
1. read 文件内容
2. 检测文件大小 → >500KB 截断前 500KB + 末尾标注「已截断」
3. create_doc(
    title = {文件名}（保留后缀）,
    body = ```{lang}\n{内容}\n```  (代码类)
           或直接 body（标记/纯文本类）
   )
4. 原始文件上传 yuque_upload_attachment(type="attachment")
5. 文档末尾追加：

   ---
   📎 原始文件：[{文件名}]({CDN URL})
```

### 图片 / 二进制文件处理

`yuque_import_doc` 自动处理，无需 Agent 额外操作：

```
图片（.png .jpg ...）→ 上传 CDN → 创建文档（嵌入 ![]())
二进制（.mp4 .zip ...）→ 上传附件 → 创建文档（📎 链接）
```

批量导入时，图片和二进制文件与其他类型一样逐文件调 `yuque_import_doc`，并发 3。

### 文档格式文件

```
.pdf .docx .xlsx .pptx 等 → 上传附件 → 创建文档（📎 链接）
```

无法提取内容写入正文（需 pandoc/pdftotext 等外部工具），但会作为附件保留原始文件。

| 来源 | 识别方式 | 格式适配 |
|------|---------|---------|
| 本地文件夹 | `exec ls/find` + 递归 `*.md` | `yuque_import_doc` 自动 regex 适配（WikiLinks/嵌入/callout/frontmatter/注释/标签） |
| ZIP 压缩包 | `exec unzip -l` → 解压 → 遍历 | 同上 |
| 单个文件 | `read` | 同上 |

---

## 格式适配层

`yuque_import_doc` 内置正则适配引擎，自动处理常见 Markdown 变体格式，不调 LLM：

| 检测模式 | 处理方式 |
|---------|---------|
| `[[文档名]]` / `[[文档名\|别名]]` | 转为纯文本 |
| `![[img.png]]` | 转为 `![](./img.png)`，后续上传 CDN |
| `---` YAML frontmatter | 提取 title 作文档标题，其余删除 |
| `> [!note]` / `[!warning]` 等 callout | 转为 `> **📝 Note:**` 格式 |
| `%% 注释 %%` | 删除 |
| `#行内tag` | 删除 |

复杂格式（如非标准表格）可通过预适配模式处理：Agent 先 `read` → LLM 适配 → 传 `body` 给 `yuque_import_doc`。

---

## 图片处理

```
检测到 ![](./path/to/img.png) 普通路径或 ![](https://...) 远程 URL：

  本地路径 → 检查文件存在 → yuque_upload_attachment → CDN URL → 替换路径
  远程 URL → 下载到临时文件 → yuque_upload_attachment → CDN URL → 替换路径
  ![[img.png]] → 适配层已转为 ![](./img.png) → 按本地路径处理

  上传限制：
    单张 ≤ 20MB（专业会员）
    超过 → 跳过，保留原始路径
    无 cookie → 全部跳过，报告中列出

  并发上传 3 张
```

---

## 导入流程

### 核心工具：`yuque_import_doc`

单篇文件导入由 `yuque_import_doc` MCP tool 完成，内部自动处理：

- 📖 读文件 + 检测类型（MD / 代码 / 文本）
- 🔧 格式适配（WikiLinks / callouts / frontmatter / 注释 / 标签）
- 🖼️ 提取本地图片 → 上传 CDN → 替换路径
- 📄 创建文档 + 自动挂 TOC
- 📎 可选：上传原始文件作为附件引用

**两种模式**：

| 模式 | body 参数 | 行为 |
|------|-----------|------|
| 自动适配 | 不传 | 读文件 → regex 适配 → 上传图片 → 创建文档 |
| 预适配 | 传 body | 使用 Agent LLM 处理好的 body，仅做图片上传+创建 |

```
# 自动适配模式

### 预适配模式（Agent 先 LLM 适配复杂内容）
yuque_import_doc(file_path="/notes/Docker.md", book_id=123)

yuque_import_doc(file_path="/notes/Docker.md", book_id=123, body="LLM处理后的内容", title="覆盖标题")
```

---

### 批量导入流程

```
0. 前置检查：
   config 有 cookie + ctoken → 继续
   无 → 「文件上传需要 Cookie 登录态，请配置后重试」

1. 扫描源：
   文件夹 → exec find {目录} -type f → 获取所有文件
   ZIP → exec unzip -l {zip} → 提取文件列表 → 解压
   单文件 → 直接确定路径
   总上限 100 篇（Markdown + 纯文本），附件不占配额

2. 文件分类 + 询问附件策略：

   📋 导入扫描结果
   来源：{路径} → 目标库：《{库名}》

   📝 Markdown（{N}篇）
   #  文件              大小    目录
   1  Docker入门.md     12KB    根
   2  Docker部署.md     8KB     📂部署/

   📄 可转为文档的文本文件（{M}个）
   #  文件              类型    大小
   1  config.json       JSON    2KB
   2  deploy.sh          bash   1KB
   3  data.csv          CSV     15KB

   🎬 附件（{K}个）→ 上传 CDN 引用
   #  文件              类型    大小
   1  demo.mp4          mp4     50MB
   2  report.pdf        pdf     3MB

3. 逐篇导入（并发 3，统一调 `yuque_import_doc`，tool 内部按类型自动分流）：

   对每篇 .md：
     a. 检查格式适配需求 → 简单适配直接调 `yuque_import_doc`
     b. 复杂适配（非标准表格等）→ Agent 先 read → LLM 适配 → 传 body 给 `yuque_import_doc`

   对其他文件：
     yuque_import_doc(file_path)
     → tool 内部按扩展名自动分流（代码→代码块 / 图片→CDN嵌入 / 附件→CDN引用）

   可选 `upload_original=true`：代码/文本文件一并上传原始文件附件。

4. 建目录（按原文件夹结构，最多 3 级）：

   6a. 创建分组 TITLE 节点：
       yuque_update_toc(action=appendNode, action_mode=sibling, type=TITLE, title=文件夹名, target_uuid={任一已有节点uuid})
       ⚠️ target_uuid 必填，拿 TOC 中最后一个节点的 uuid 即可

   6b. 将文档挂到分组下（两步操作）：
       ① removeNode：yuque_update_toc(action=removeNode, action_mode=sibling, node_uuid={DOC的TOC uuid})
       ② appendNode child：yuque_update_toc(action=appendNode, action_mode=child, type=DOC, doc_ids=[{doc_id}], target_uuid={TITLE uuid})
       ⚠️ DOC 已在 TOC 中时不能直接用 appendNode child，必须先 removeNode

   6c. 子分组嵌套（如 开发/前端）：
       ① 创建父 TITLE "开发"
       ② 创建子 TITLE "前端"：appendNode child + target_uuid=父TITLE的uuid
       ③ 文档挂到子 TITLE 下（同 6b）

5. TOC 优化：
   深度 > 3 级 → 调 batch/rebuild-toc 智能扁平化

6. 报告
```

---

## 目录映射

```
文件夹结构 → 语雀 TOC 节点：

  notes/
    root.md              → 根级文档「root」
    Docker/              → TOC 一级节点「Docker」
      install.md         →   文档「install」
      compose.md         →   文档「compose」
    Java/                → TOC 一级节点「Java」
      Spring/            → TOC 二级节点「Spring」
        boot.md          →   文档「boot」
        cloud.md         →   文档「cloud」

限制：最多 3 级目录深度。

超 3 级检测：导入完成后检查 TOC → >3 → 调 batch/rebuild-toc 优化
```

---

## 报告

```
✅ 导入完成

来源：{路径} → 目标库：《{库名}》

📝 文档：{N} 篇 | ✅ 成功 {OK} | ❌ 失败 {F}
🖼️ 图片：{I} 张（CDN 嵌入）
📎 附件：{A} 个（CDN 引用）

✅ 已导入：
  1. Docker入门 → {链接}
  2. config.json → {链接}
  3. deploy.sh → {链接}
  4. logo.png → {链接}
  5. demo.mp4 → {链接}

🔧 格式适配：{X} 篇
📂 TOC：已按原结构挂载 {Y} 个节点
```

---

## 上限保护

| 项 | 上限 |
|----|------|
| 单次导入 Markdown+文本 | 100 篇 |
| 附件文件 | 50 个 |
| 附件大小 | 图片20MB / 附件500MB（专业会员） |
| 图片大小 | 20MB/张（专业会员） |
| 单篇图片数 | 20 张 |
| 目录深度 | 3 级（超则自动优化） |
| 并发导入 Markdown | 3 篇 |
| 并发导入纯文本 | 3 个 |
| 并发上传附件 | 3 个 |

---

## 跨 Skill 联动

```
导入后 TOC > 3 级 → batch/rebuild-toc
导入后格式问题 → batch/format
导入后想分类 → batch/classify
```

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 无 cookie | 「上传需要 Cookie，请配置后重试」 |
| 文件不存在 | 「路径不存在，请检查」 |
| 单文件过大 | 截断（正文 >500KB）或上传失败（附件 > 上限） |
| 图片/附件上传失败 | 返回错误信息 |

---

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 扫描 | `exec find/ls/unzip` |
| 导入（全类型） | `yuque_import_doc`（自动分流：MD适配 → 代码块 / 图片CDN / 附件CDN → 创建文档） |
| 预适配导入 | `yuque_import_doc`（传 body） |
| 建 TITLE 分组 | `yuque_update_toc` (appendNode sibling) |
| 挂文档到分组 | `yuque_update_toc` (removeNode → appendNode child) |
| TOC 优化 | batch/rebuild-toc（技能联动） |

## TOC 操作速查

> ⚠️ **语雀 TOC API 有 ~3 秒缓存延迟**。PUT 操作返回 200 后，GET 可能仍返回旧数据。TOC 操作间需留 3 秒间隔。

| 操作 | action | action_mode | 关键字段 |
|------|--------|-------------|---------|
| 创建根级 TITLE | appendNode | sibling | type:TITLE + title + target_uuid:{任一节点uuid} |
| 创建子级 TITLE | appendNode | child | type:TITLE + title + target_uuid:{父TITLE uuid} |
| 文档挂分组 | removeNode(sibling) → appendNode | child | node_uuid → doc_ids + target_uuid |
| 删除节点 | removeNode | sibling | node_uuid |
| 重命名节点 | editNode | sibling | node_uuid + title + type |