# 语雀 AI Skill

> ⚠️ **DEPRECATED — 已停止维护 (2026-06-06)**
>
> 关键词索引架构过于复杂，已废弃。基础 CRUD 工具（list_repos / list_toc / get_doc / create_doc 等）仍可用，但索引构建、知识库搜索、图谱等高级功能不再维护。
>
> 替代方案：TOC 树导航（无向量 RAG），详见 [tree-search](https://github.com/yehuoshun/yuque-ai-mcp/tree/main/tree-search)（待建）。

[![License](https://img.shields.io/github/license/yehuoshun/yuque-ai-mcp)](./LICENSE)
[![Status](https://img.shields.io/badge/status-deprecated-red)](./DEPRECATED.md)

---

## ⚠️ 免责声明

- 本项目**非语雀官方产品**，与蚂蚁集团/语雀团队无任何关联
- 使用前请**备份重要数据**。本工具涉及文档创建/修改/删除，误操作可能导致数据丢失
- 作者对因使用本工具造成的任何数据丢失、账号限制或其他后果**不承担责任**
- 请遵守[语雀服务协议](https://www.yuque.com/yuque/qeyyk7/bl95f1imynp9u6pg?view=doc_embed&title=0)，控制请求频率避免触发限流

---

## vs 官方生态

官方生态由 3 个核心组件构成：[yuque-mcp-server](https://github.com/yuque/yuque-mcp-server)（MCP Server 核心，16 tools） + [yuque-ecosystem](https://github.com/yuque/yuque-ecosystem)（OpenClaw 插件，8 skills） + [yuque-plugin](https://github.com/yuque/yuque-plugin)（Claude Code 插件，4+2 skills）。

### MCP Tools 逐类对比

| 分类 | 官方（yuque-mcp-server） | 🦞 本项目 |
|------|--------------------------|--------|
| 用户 | `get_user` | `get_user` + `health_check` 🆕 |
| 搜索 | `search` | `search` + `kb_search` 🆕 + `batch_get_docs_body` 🆕 |
| 知识库 | `list_books` `get_book` `create_book` `update_book` | 同左 + `delete_repo` 🆕 |
| 文档 | `list_docs` `get_doc` `create_doc` `update_doc` | 同左 + `delete_doc` 🆕 + `list_doc_versions` 🆕 + `get_doc_version` 🆕 |
| 目录 | `get_toc` `update_toc` | 同左 + `remove_toc_node` 🆕 |
| 小记 | `list_notes` `get_note` `create_note` `update_note` | 同左 + `delete_note` 🆕 + `restore_note` 🆕 |
| 回收站 | ❌ | `list_recycles` 🆕 `restore_recycle` 🆕 `destroy_recycle` 🆕 |
| 群组 | ❌ | `list_group_users` 🆕 `update_group_user` 🆕 `remove_group_user` 🆕 |
| 统计 | ❌ | `get_group_stats` 🆕 `get_member_stats` 🆕 `get_book_stats` 🆕 `get_doc_stats` 🆕 |
| 上传 & 导入 | ❌ | `upload_attachment` 🆕 `import_doc` 🆕 |
| 索引构建 | ❌ | `index_create` 🆕 `index_update_entries` 🆕 |
| **合计** | **16 个** | **49 个**（16 基础 + 33 独有） |

> 🦞 本项目覆盖官方全部 16 个工具，并多出 33 个独有工具：删除/恢复/版本历史/群组/统计/回收站/上传导入/索引构建/个人仪表盘/健康检查/配置管理/分组管理。

### Skills 矩阵

| 维度 | 🏛 yuque-ecosystem | 🏛 yuque-plugin | 🦞 本项目 |
|------|-------------------|----------------|--------|
| Skills 总数 | 8 个 | 4（个人）/ 6（团队） | **24 个** |
| 知识库问答 | `smart-search` | `smart-search` | **单层索引 + 多路并发 + 降级** |
| 智能摘要 | `smart-summary`（两档） | `smart-summary`（两档） | `summarize`（L1-L4 四级） |
| 阅读摘录 | `reading-digest` | — | `digest`（五维提取 + 知识卡片） |
| 碎片收集 | `daily-capture` | — | `inbox`（三种模式 + 可配置清理） |
| 笔记打磨 | `note-refine` | — | `refine`（三级打磨 + N次打磨 + 批量） |
| 风格分析 | `style-extract` | — | `analyze`（10 维风格画像） |
| 风格迁移 | — | — | `transfer`（风格画像→重写→对照） |
| 模板写作 | — | — | `template`（6 种预设模板） |
| 知识关联 | `knowledge-connect` | — | `knowledge`（图谱 + 交叉引用 + 聚类） |
| 过时检测 | `stale-detector` | — | `audit`（版本审计 + 变更追踪 + 对比） |
| 会议纪要 | — | `meeting-notes` | 🟰 无专用模板 |
| 技术方案 | — | `tech-design` | 🟰 无专用模板 |
| 周报 | — | `weekly-report` | `dashboard`（维度远超周报） |
| 入职指南 | — | `onboarding-guide`（团队） | ❌ 官方独有 |
| 知识报告 | — | `knowledge-report`（团队） | `dashboard`（覆盖健康度+运营） |
| 批量运维 | — | — | ✅ 归档/分类/格式化/重命名/重构/仪表盘/审计 |
| 翻译 & 同步 | — | — | ✅ 批量翻译 + 文档镜像同步 |
| 拆分 & 合并 | — | — | ✅ split + merge |
| 备份 & 下载 | — | — | ✅ 全量下载到本地，含TOC结构+图片+附件 |
| 外部导入 | — | — | ✅ 本地/Obsidian/Notion |

> 🦞 官方优势仅在 CLI 开箱体验 + `meeting-notes`/`tech-design`/`onboarding-guide` 三个专用模板，其余维度本项目全面超越。

---

## 架构

```
yuque-mcp (MCP Server)     ← 49 个 MCP Tools（CRUD/搜索/导入/统计/群组/回收站/仪表盘/健康检查/热重载/配置管理/分组管理）
    ↓
业务 Skills                ← 24 个 Skill Markdown（manage/transform/insight/collect/write 五分类）
    ↓
LLM Agent                  ← 问答编排 & 业务流转
```

| 组件 | 技术栈 | 说明 |
|------|--------|------|
| `server/` | TypeScript + `@modelcontextprotocol/sdk` | MCP Server，提供 49 个 tools |
| `skills/` | Markdown | 业务 Skills（manage/transform/insight/collect/write 五分类，24 个技能） |
| `SKILL.md` | Markdown | AI Agent 执行指南（问答 pipeline + 索引构建 + 业务 skill 路由） |

---

## 快速开始

### 1. 安装

```bash
cd server
npm install
npm run build
```

### 2. 配置

```bash
cp config/yuque-config.example.json config/yuque-config.json
# 编辑填入 token、group、route_books
```

配置格式：

```json
{
  "token": "语雀 API Token",
  "group": "yehuoshun",
  "route_books": [
    { "book_id": 78276514, "namespace": "yehuoshun/index-sub-1" }
  ],
  "graph_book": { "book_id": 79724085, "namespace": "yehuoshun/graph-book-xxx" },
  "user_id": "25689388",
  "cookie": "完整的浏览器 Cookie 字符串（文件上传/回收站管理必填）",
  "ctoken": "从 Cookie 中提取 yuque_ctoken 的值"
}
```

| 配置项 | 必填 | 说明 |
|--------|------|------|
| `token` | ✅ | 语雀 API Token（需 doc:read/doc:write/repo:read/repo:write） |
| `group` | ✅ | 语雀用户名/login |
| `route_books` | ✅ | 索引库列表（创建索引文档时未指定目标则用首个，kb_search 并行搜所有索引库） |
| `graph_book` | 按需 | 图谱知识库（存 graphN 分片，搜索扩展用，不配则图谱扩展静默跳过） |
| `user_id` | 按需 | 用户 ID（文件上传必填，`yuque_get_user` 可查） |
| `cookie` | 按需 | 浏览器 Cookie 完整字符串（文件上传/回收站管理必填） |
| `ctoken` | 按需 | 从 Cookie 中提取 `yuque_ctoken` 的值 |

### 3. 在 MCP 客户端配置

**方式一：npm 安装（规划中）**

```json
{
  "mcpServers": {
    "yuque-mcp": {
      "command": "npx",
      "args": ["yuque-mcp"],
      "env": {
        "YUQUE_TOKEN": "<Token>",
        "YUQUE_GROUP": "<用户名>",
        "YUQUE_ROUTE_SUBS": "[{\"book_id\":78276514,\"namespace\":\"yehuoshun/index-lib\"}]",
        "YUQUE_GRAPH_BOOK": "{\"book_id\":79724085,\"namespace\":\"yehuoshun/graph-lib\"}",
        "YUQUE_SEARCH_CONCURRENCY": "5",
        "YUQUE_COOKIE": "<Cookie>",
        "YUQUE_CTOKEN": "<CSRF Token>",
        "YUQUE_USER_ID": "<用户ID>"
      }
    }
  }
}
```

**方式二：本地开发**

```json
{
  "mcpServers": {
    "yuque-mcp": {
      "command": "node",
      "args": ["server/dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp"
    }
  }
}
```

---

## MCP Tools 全览（49 个）

### 知识库分组操作 ⚠️ 需 Cookie 登录态

| Tool | 说明 |
|------|------|
| `yuque_list_repo_groups` | 列出知识库分组（仪表盘分组视图） |
| `yuque_create_book_stack` | 创建知识库分组 |
| `yuque_update_book_stack` | 更新分组名称 |
| `yuque_sort_book_stacks` | 调整分组排序 |
| `yuque_move_books` | 移动知识库到指定分组 |

### 知识库

| Tool | 说明 |
|------|------|
| `yuque_list_repos` | 列出所有知识库 |
| `yuque_get_repo` | 获取知识库详情 |
| `yuque_create_repo` | 创建知识库（slug 必填，规则：{英文名}-{时间戳秒}） |
| `yuque_update_repo` | 更新知识库（名称/描述/可见性） |
| `yuque_delete_repo` | ⚠️ 硬删除知识库，不可恢复 |

### 文档

| Tool | 说明 |
|------|------|
| `yuque_list_docs` | 列出文档 |
| `yuque_get_doc` | 获取文档（JSON 多格式，body/body_html/body_lake） |
| `yuque_create_doc` | 创建文档 + 自动挂 TOC |
| `yuque_update_doc` | 更新文档（标题/正文/路径/格式/可见性） |
| `yuque_delete_doc` | ⚠️ 硬删除文档，不可恢复 |
| `yuque_list_doc_versions` | 文档版本历史 |
| `yuque_get_doc_version` | 文档版本详情 |

### 目录

| Tool | 说明 |
|------|------|
| `yuque_list_toc` | 列出目录结构 |
| `yuque_update_toc` | 更新目录（append/prepend/edit/remove + sibling/child） |
| `yuque_remove_toc_node` | 移除目录节点（不删文档） |

### 小记

| Tool | 说明 |
|------|------|
| `yuque_list_notes` | 列出小记（支持 status=9 查已删除） |
| `yuque_get_note` | 获取小记详情 |
| `yuque_create_note` | 创建小记 |
| `yuque_update_note` | 更新小记 |
| `yuque_delete_note` | 软删除小记（移入回收站，可恢复） |
| `yuque_restore_note` | 恢复已删除的小记 |

### 回收站 ⚠️ 需 Cookie 登录态

| Tool | 说明 |
|------|------|
| `yuque_list_recycles` | 列出回收站项目（支持分页+类型筛选） |
| `yuque_restore_recycle` | 恢复回收站中的文档/小记 |
| `yuque_destroy_recycle` | ⚠️ 彻底删除，不可恢复 |

### 群组

| Tool | 说明 |
|------|------|
| `yuque_list_group_users` | 列出群组成员 |
| `yuque_update_group_user` | 变更成员角色 |
| `yuque_remove_group_user` | ⚠️ 移除成员 |

### 统计（需 statistic:read 权限）

| Tool | 说明 |
|------|------|
| `yuque_get_group_stats` | 团队整体统计 |
| `yuque_get_member_stats` | 团队成员统计 |
| `yuque_get_book_stats` | 团队知识库统计 |
| `yuque_get_doc_stats` | 团队文档统计 |

### 知识库搜索 & 索引

| Tool | 说明 |
|------|------|
| `yuque_kb_search` | 知识库管道搜索（索引库直搜 + 图谱扩展 + 自动降级）：token 数组 → 并行搜所有索引库 → 读索引文档 body → 展开 entries → 按 weight 降序返回。默认截断 20 条，超出的低权重自然淘汰。返回 `total_entries`/`truncated` 标识截断状态 |
| `yuque_index_create` | 创建关键词索引文档。标题为关键词，body 为 Markdown 块格式（`# 标题 / ## 关键词 / ## 搜索面 / ## 摘要 / ## 章节树(可选) / ## doc_id / ## 链接 / ## 权重`），语雀全文索引可搜。支持同义别名策略：索引构建时 LLM 根据 5 条推导规则自动生成多叫法关键词文档 |
| `yuque_index_update_entries` | 增量更新关键词索引文档 entries：支持 add（追加）/ remove（移除）/ update（按 doc_id 合并字段）。自动完成读-改-写原子操作。entries 清空时自动删除索引文档。200KB body 检查 |

### 搜索 & 批量获取 & 元信息

| Tool | 说明 |
|------|------|
| `yuque_search` | 搜索语雀内容（文档/知识库，支持 scope 限定范围），Markdown 输出（分页+去重+URL） |
| `yuque_batch_get_docs_body` | 批量获取多篇文档 Markdown 正文（并发数由 config 控制，默认 5） |
| `yuque_get_user` | 当前 Token 用户详情 |
| `yuque_get_user_stats` | 个人写作统计仪表盘（知识库/文档/编辑/字数/社交/小记全维度，⚠️ 需 Cookie） |
| `yuque_health_check` | 健康检查（Token 有效性 + 知识库连通性） |

### 上传 & 导入

| Tool | 说明 |
|------|------|
| `yuque_upload_attachment` | 上传文件到语雀 CDN（image/attachment/video，上限按类型） |
| `yuque_import_doc` | 导入本地文件到知识库（自动适配格式/图片上传） |

### 配置管理

| Tool | 说明 |
|------|------|
| `yuque_config_status` | 检查配置状态（索引库是否已配、容量使用率） |
| `yuque_config_update` | 更新配置（追加 route_books 条目，自动持久化并重载） |
| `yuque_reload_config` | 热重载配置文件，修改后无需重启 MCP Server |

---

## 知识库问答

单层索引架构：索引库 + 图谱库。索引库存储关键词索引文档（标题=关键词，body 为 Markdown 块格式：`# 文档标题 / ## 关键词 / ## 搜索面 / ## 摘要 / ## 章节树(可选) / ## doc_id / ## 链接 / ## 权重`）。构建时 LLM 按 5 条推导规则（去符号转写/缩写↔全称/中英互译/技术名去符号/大小写变体）自动生成多叫法关键词索引，覆盖所有搜索入口。搜索时直接并行搜所有索引库，语雀原生搜索覆盖标题+正文。图谱库存储关键词共现邻接表（graphN 分片），listAllDocs 全量读取用于搜索扩展。纯 LLM + 语雀 API，零外部向量数据库依赖。

搜索管线、索引构建、搜索降级 → **[SKILL.md](./SKILL.md#二知识库问答系统)**。

---

## 业务 Skills

基于 MCP 49 tools 的高层业务能力。全部遵循：先预览后确认、单篇隔离不传染、上限 100 篇、结束出报告。

### 知识管理（manage/）

| Skill | 说明 |
|-------|------|
| [archive](skills/manage/archive.md) | 批量归档/备份旧文档（归档移动 / 备份复制两种模式） |
| [backup](skills/manage/backup.md) | 知识库完整下载到本地（全量导出，含TOC结构+图片+附件） |
| [purify](skills/manage/purify.md) | 知识库净化（清洗标题/内容/结构 → 去广告去HTML垃圾 → 重建新库） |
| [classify](skills/manage/classify.md) | 智能分类打标（AI 分析主题 → 自动设计目录树 → 重建结构） |
| [format](skills/manage/format.md) | 批量格式标准化（预设风格 / 参考文档 / 自定义规则三种来源） |
| [import](skills/manage/import.md) | 外部文档导入（本地/Obsidian/Notion，格式适配 + 图片上传） |
| [merge](skills/manage/merge.md) | 多篇文档合并为单篇长文 |
| [rebuild-toc](skills/manage/rebuild-toc.md) | 目录智能重构（保留意图优化现有结构） |
| [rename](skills/manage/rename.md) | 批量重命名（前缀/后缀/序号/查找替换/正则/模板/移除） |
| [sync](skills/manage/sync.md) | 文档镜像 & 知识库同步（单向/双向/增量/差异检测） |

### 内容加工（transform/）

| Skill | 说明 |
|-------|------|
| [split](skills/transform/split.md) | 长文按标题层级自动拆分为多篇 |
| [summarize](skills/transform/summarize.md) | 多粒度智能摘要（L1-L4 四级 + 单篇/多篇/知识库） |
| [translate](skills/transform/translate.md) | AI 批量翻译（单篇/批量/多语言/增量，保留 Markdown 格式） |

### 洞察分析（insight/）

| Skill | 说明 |
|-------|------|
| [audit](skills/insight/audit.md) | 文档版本审计 & 变更追踪（变更日报/单篇历史/版本对比/协作追踪） |
| [dashboard](skills/insight/dashboard.md) | 知识库运营仪表盘（周报/概览/成员详情，纯只读） |
| [digest](skills/insight/digest.md) | 阅读摘录（核心观点/金句/行动项/疑思五维 + 知识卡片） |
| [knowledge](skills/insight/knowledge.md) | 知识图谱 & 树搜索（共现图/Louvain社区检测/索引质量检查/章节树） |
| [search](skills/insight/search.md) | 知识库管道搜索（N 路并行 + 去重 + 降级） |
| [index](skills/insight/index.md) | 索引构建（文档中心 v4 + 单文档粒度原子同步） |

### 碎片收集（collect/）

| Skill | 说明 |
|-------|------|
| [inbox](skills/collect/inbox.md) | 碎片收集整理（三种模式 + 可配置清理策略） |

### 写作辅助（write/）

| Skill | 说明 |
|-------|------|
| [polish](skills/write/polish.md) | AI 写作工作室（触发词路由 → 风格分析/打磨/迁移/模板） |
| [analyze](skills/write/analyze.md) | 写作风格分析（10 维画像 + 单篇/对比/知识库模式） |
| [refine](skills/write/refine.md) | 笔记打磨（三级打磨 + N 次打磨 + 批量模式） |
| [transfer](skills/write/transfer.md) | 风格迁移（提取风格画像 → 重写 → 对照） |
| [template](skills/write/template.md) | 模板写作（6 种预设模板：技术方案/周报/复盘/纪要/API/PRD） |

---

## 项目结构

```
yuque-ai-mcp/
├── SKILL.md                  # AI Agent 执行规范
├── README.md                 # 本文件
├── config/
│   ├── yuque-config.example.json
│   └── yuque-config.json     # 不入库
├── references/
│   └── api_reference.md      # 语雀 OpenAPI 完整参考
├── skills/                   # 业务 Skills（24 个）
│   ├── manage/               # 知识管理（9 个）
│   ├── transform/            # 内容加工（3 个）
│   ├── insight/              # 洞察分析（6 个）
│   ├── collect/              # 碎片收集（1 个）
│   └── write/                # 写作辅助（5 个）
├── server/               # MCP Server (TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           # Server 入口（注册 49 个 tools）
│       ├── client.ts          # 语雀 HTTP 客户端（v2 API + web API）
│       ├── config.ts          # 配置读取（支持环境变量 + 配置文件）
│       ├── shared/types.ts    # 共享类型
│       └── tools/
│           ├── repos.ts       # 知识库 CRUD
│           ├── book-stacks/   # 知识库分组（Cookie 态）
│           ├── docs.ts        # 文档 CRUD + 版本 + 目录
│           ├── notes.ts       # 小记 CRUD + 软删除/恢复
│           ├── recycles.ts    # 回收站 list/restore/destroy
│           ├── search.ts      # 搜索
│           ├── export.ts      # 批量获取正文
│           ├── user.ts        # 用户信息 + 健康检查
│           ├── groups.ts      # 群组成员管理
│           ├── statistic.ts   # 四维统计
│           ├── upload.ts      # CDN 文件上传
│           ├── import.ts      # 文件导入
│           ├── kb.ts          # 知识库搜索 & 索引构建
│           └── dark-arts-loader.ts  # 🕶️ 邪修玩法加载器
└── .github/workflows/
    └── dingtalk-notify.yml
```

---

## API 参考

基地址：`https://www.yuque.com/api/v2`

完整端点/参数/错误码/限流/回收站 Web API → **[references/api_reference.md](./references/api_reference.md)**