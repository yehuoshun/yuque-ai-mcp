# 外部文档导入（import）

从本地文件夹 / Obsidian Vault / Notion 导出 ZIP 批量导入语雀知识库，自动适配格式、上传图片、建目录。

## 触发词

```
「导入」「导入到语雀」「把文件夹导入」
「导入 Obsidian Vault」「导入 Notion 导出文件」
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

## 来源支持

| 来源 | 识别方式 | 格式适配 |
|------|---------|---------|
| 本地文件夹 | `exec ls/find` + 递归 `*.md` | 有特殊语法 → LLM 适配 |
| Obsidian Vault | 同上（本质上就是文件夹） | `[[]]` `![[img]]` `> [!note]` `%%` `---` frontmatter |
| Notion 导出 ZIP | `exec unzip` → 遍历 Markdown | Notion 特有表格格式 |
| 单个 Markdown | `read` | 同上 |

---

## 格式适配层

```
在读文件后、创建文档前，检测并适配非标准 Markdown：

检测逻辑（正则，不调 LLM）：
  有 [[ → Obsidian Wiki Link → 需适配
  有 ![[ → Obsidian 嵌入图片 → 需适配
  有 > [! → callout → 需适配
  有 %% → 注释 → 需适配
  有 --- 开头的 YAML → frontmatter → 需适配
  都没有 → 纯标准 Markdown → 跳过适配

需要适配时，调 LLM：

Prompt：
  将以下 {来源} 格式的 Markdown 适配为语雀标准格式。

  规则：
    1. [[文档名]] → 转为纯文本「文档名」
    2. [[文档名|别名]] → 转为纯文本「别名」
    3. ![[image.png]] → 转为 ![](./image.png)（后续上传处理）
    4. --- YAML frontmatter → 提取 title 作为文档标题，其余删除
    5. > [!note] 内容 → > **📝 Note:** 内容
    6. > [!warning] 内容 → > **⚠️ Warning:** 内容
    7. > [!tip] / > [!info] / > [!danger] → 类似转换
    8. %% 注释内容 %% → 删除
    9. #行内tag → 删除
    10. 保留所有 Markdown 标准格式（标题/列表/代码块/引用/加粗/斜体/表格/链接）
    11. 不改变原文事实内容，只改格式标记

  原文：
  {body}

  适配后：
```

---

## 图片处理

```
检测到 ![](./path/to/img.png) 普通路径或 ![](https://...) 远程 URL：

  本地路径 → 检查文件存在 → yuque_upload_image → CDN URL → 替换路径
  远程 URL → 下载到临时文件 → yuque_upload_image → CDN URL → 替换路径
  Obsidian ![[img.png]] → 适配层已转为 ![](./img.png) → 按本地路径处理

  上传限制：
    单张 ≤ 2MB
    超过 → 跳过，保留原始路径
    无 cookie → 全部跳过，报告中列出

  并发上传 3 张
```

---

## 导入流程

```
0. 前置检查：
   config 有 cookie + ctoken → 继续
   无 → 「图片上传需要 Cookie 登录态，请配置后重试」

1. 扫描源：
   文件夹 → exec find {目录} -name '*.md' → 获取所有 .md 路径
   ZIP → exec unzip -l {zip} → 提取 .md 列表 → 解压
   单文件 → 直接确定路径
   上限 100 篇

2. 预览：

   📋 导入预览
   来源：{路径/文件名} → 目标库：《{库名}》
   类型：{Obsidian/Notion/本地}

   #  文件              大小    来源目录
   1  Docker入门.md     12KB    根
   2  Docker部署.md     8KB     📂部署/
   3  K8s基础.md        15KB    📂部署/
   ...

   共 {N} 篇 | 含 {M} 张图片 | {需要适配的篇数} 篇需格式适配

   「确认导入」「排除 N号」「改目标库」「取消」

3. 逐篇导入（并发 3）：

   对每篇 .md：
     a. read 文件内容
     b. 检测是否需要格式适配 → 需要则 LLM 适配
     c. 适配后提取 title（from frontmatter or filename）
     d. 正则提取 ![](路径) → 本地/远程图片
     e. 逐张上传（并发 3）→ 替换路径为 CDN URL
     f. yuque_create_doc(title, body)

4. 建目录：
   按原文件夹结构 → yuque_update_toc 挂 TOC 节点（最多 3 级）

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

来源：~/Obsidian/vault/ → 目标库：《{库名}》

📊 {N} 篇 | 成功 {K} | 失败 {F} | 跳过 {S}

✅ 已导入：
  1. Docker入门 → {链接}
  2. Java基础 → {链接}

🖼️ 图片：上传 {M} 张 | 跳过 {P} 张
  跳过（如有）：
    ./screenshots/big.png (3.2MB) → Docker部署.md
    ./logo.png (无 cookie) → 全部文档

🔧 格式适配：{X} 篇
📂 TOC：已按原结构挂载 {Y} 个节点
  {如有优化} TOC 已优化（扁平化 {Z} 级 → 3 级）

❌ 失败（如有）：
  xxx.md — 文件读取失败
```

---

## 上限保护

| 项 | 上限 |
|----|------|
| 单次导入 | 100 篇 |
| 图片大小 | 2MB/张 |
| 单篇图片数 | 20 张 |
| 目录深度 | 3 级（超则自动优化） |
| 并发导入 | 3 篇 |
| 并发上传 | 3 张 |

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
| 无 cookie | 「图片上传需要 Cookie，请配置后重试」 |
| 源路径不存在 | 「路径不存在，请检查」 |
| 非 .md 文件 | 跳过，报告中标注 |
| 单文件过大 > 5MB | 跳过，提示「文件过大」 |
| 图片上传失败 | 保留原路径，继续导入正文 |
| 创建文档失败 | 记录失败，继续下一篇 |
| API 限流(429) | 等 Retry-After，最多重试 3 次 |

---

## 依赖工具

| 阶段 | 工具 |
|------|------|
| 扫描 | `exec find/ls/unzip` |
| 读文件 | `read` |
| 格式适配 | LLM（本 Agent） |
| 上传图片 | `yuque_upload_image` |
| 创建文档 | `yuque_create_doc` |
| 建目录 | `yuque_update_toc` |
| TOC 优化 | batch/rebuild-toc（技能联动） |