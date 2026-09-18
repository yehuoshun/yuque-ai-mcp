<p align="center">
  <img src="https://raw.githubusercontent.com/yehuoshun/yuque-ai-mcp/main/assets/banner.png" width="800" alt="yuque-ai-mcp" />
</p>

<p align="center">
  <h1 align="center">yuque-ai-mcp</h1>
  <p align="center">
    <b>62 个 MCP 工具（46 OpenAPI + 16 Web API）</b>
  </p>
</p>

<p align="center">
  <a href="https://github.com/yehuoshun/yuque-ai-mcp"><img src="https://img.shields.io/badge/版本-2.14.0-blue" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可-MIT-green" alt="license" /></a>
  <a href="https://github.com/yehuoshun/yuque-ai-skills"><img src="https://img.shields.io/badge/skills-67%20指导-orange" alt="skills" /></a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

基于 [Model Context Protocol](https://modelcontextprotocol.io/) 的语雀全功能 MCP Server。62 个工具，13 个域——46 个语雀 OpenAPI 端点 + 16 个需要浏览器会话 Cookie 的 Web API 工具。

## 为什么选这个

- **19 → 62 工具** — 比官方 [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) 多 3 倍覆盖
- **双传输模式** — stdio + HTTP SSE，共享注册中心，修改无需重启
- **模块化架构** — 13 个域，barrel export，唯一注册中心
- **完整 API 覆盖** — 团队、回收站、上传、统计、版本、画板——补全官方缺失
- **[Skill 层](https://github.com/yehuoshun/yuque-ai-skills)** — 67 个 AI Agent 使用指导

## 目录

- [快速开始](#快速开始)
- [工具概览](#工具概览)
- [与官方对比](#与官方对比)
- [架构](#架构)
- [配置](#配置)
- [错误处理](#错误处理)
- [贡献](#贡献)
- [许可](#许可)

## 快速开始

```bash
cd server
npm install
npm run build

# 复制配置模板
cp config/config.example.json config/config.json
# 编辑 config.json 填入你的语雀 API Token

# 运行
npm start              # stdio 模式
npm run dev:http       # HTTP SSE 模式 (http://localhost:3099)
```

> 开发时用 `npm run dev:http` 启动 `tsx` 热重载。

## 工具概览

| 域 | 工具数 | 亮点 |
|--------|-------|------------|
| **doc** | 15 | CRUD、版本管理、Diff、批量获取、URL/文件导入、跨库复制、导出、资源下载 |
| **repo** | 8 | CRUD、批量获取、跨库复制、全量导出（TOC 结构 + INDEX/GRAPH） |
| **toc** | 3 | 获取、更新、批量更新（createTitle/appendNode/removeNode/moveNode） |
| **search** | 3 | 通用搜索 + RAG 增强搜索 + Cookie Web 搜索 |
| **user** | 3 | 用户信息、心跳、团队列表 |
| **group** | 3 | 成员列表、角色变更、删除成员 |
| **statistic** | 4 | 团队/成员/知识库/文档统计 |
| **note** | 4 | CRUD + 软删除/恢复 |
| **recycle** | 3 | 列表、恢复、彻底删除（Cookie 认证） |
| **upload** | 1 | 文件上传到语雀 CDN（Cookie 认证） |
| **board** | 3 | 思维导图、流程图、架构图 |
| **mine** | 4 | 书架列表、编辑中心、更新/排序书架（Cookie 认证） |
| **web_doc** | 8 | Web API：获取/列出文档、知识库、目录，移动/复制/删除目录节点（Cookie 认证） |
| **合计** | **62** | |

### 全部 62 个工具

| 工具 | 域 | 说明 |
|------|--------|-------------|
| `yuque_hello` | user | 心跳检测，验证 Token 有效性 |
| `yuque_get_user` | user | 获取当前 Token 的用户详情 |
| `yuque_get_user_groups` | user | 获取用户所属的团队列表 |
| `yuque_search` | search | 通用搜索文档/知识库 |
| `yuque_rag_search` | search | RAG 检索增强搜索 + 自动获取文档内容 |
| `yuque_web_search` | search | Cookie 态 Web 搜索，返回完整文档对象 + 精确总数 + 高亮摘要 |
| `yuque_get_group_users` | group | 获取团队成员列表 |
| `yuque_update_group_user` | group | 变更团队成员角色 |
| `yuque_delete_group_user` | group | 删除团队成员 |
| `yuque_list_docs` | doc | 获取知识库文档列表 |
| `yuque_create_doc` | doc | 创建文档 |
| `yuque_get_doc` | doc | 获取文档详情（支持 ID 或 slug） |
| `yuque_update_doc` | doc | 更新文档 |
| `yuque_delete_doc` | doc | 删除文档 |
| `yuque_batch_get_docs` | doc | 批量获取文档详情（max 20） |
| `yuque_get_doc_versions` | doc | 获取文档历史版本列表 |
| `yuque_get_doc_version_detail` | doc | 获取文档历史版本详情 |
| `yuque_diff_doc_versions` | doc | 对比两个版本的行级差异 |
| `yuque_copy_doc` | doc | 单文档跨库复制 |
| `yuque_export_doc` | doc | 导出单篇文档为 Markdown 文件 |
| `yuque_export_resources` | doc | 下载文档中的图片/附件到本地 |
| `yuque_import_url` | doc | 从网页 URL 导入文档 |
| `yuque_import_file` | doc | 从本地文件导入文档 |
| `yuque_embed_url` | doc | 生成文档嵌入阅读器 URL |
| `yuque_get_toc` | toc | 获取知识库目录 |
| `yuque_update_toc` | toc | 更新知识库目录 |
| `yuque_batch_update_toc` | toc | 批量更新目录（createTitle/appendNode/removeNode/moveNode/prependDoc） |
| `yuque_list_repos` | repo | 获取知识库列表（用户/团队） |
| `yuque_create_repo` | repo | 创建知识库 |
| `yuque_get_repo` | repo | 获取知识库详情 |
| `yuque_update_repo` | repo | 更新知识库 |
| `yuque_delete_repo` | repo | 删除知识库 |
| `yuque_batch_get_repos` | repo | 批量获取知识库详情（max 20） |
| `yuque_copy_repo` | repo | 批量跨库复制（LLM 分类 + 目录重建） |
| `yuque_export_repo` | repo | 批量导出知识库为 Markdown（按 TOC 目录结构） |
| `yuque_get_group_statistics` | statistic | 获取团队汇总统计数据 |
| `yuque_get_member_statistics` | statistic | 获取团队成员统计数据 |
| `yuque_get_book_statistics` | statistic | 获取团队知识库统计数据 |
| `yuque_get_doc_statistics` | statistic | 获取团队文档统计数据 |
| `yuque_list_notes` | note | 获取小记列表 |
| `yuque_get_note` | note | 获取小记详情 |
| `yuque_create_note` | note | 创建小记 |
| `yuque_update_note` | note | 更新小记 |
| `yuque_list_recycles` | recycle | 列出回收站项目 |
| `yuque_restore_recycle` | recycle | 恢复回收站项目 |
| `yuque_destroy_recycle` | recycle | 彻底删除回收站项目 |
| `yuque_upload_attachment` | upload | 上传文件到语雀 CDN |
| `yuque_get_board` | board | 获取文档中的画板资源 |
| `yuque_create_board` | board | 在文档中创建画板资源 |
| `yuque_update_board` | board | 更新文档中的画板资源 |
| `yuque_get_book_stacks` | mine | 获取知识库分组（书架）列表 |
| `yuque_get_editor_center` | mine | 获取个人编辑中心全景数据 |
| `yuque_update_book_stack` | mine | 移动知识库到指定分组（书架） |
| `yuque_sort_book_stack` | mine | 排序知识库分组（书架） |
| `yuque_web_get_doc` | web_doc | Cookie 态读文档正文（含 body/content），不受会员过期限流 |
| `yuque_web_list_docs` | web_doc | Cookie 态列文档列表，更丰富的字段 |
| `yuque_web_list_repos` | web_doc | Cookie 态列知识库列表，含权限信息 |
| `yuque_web_get_toc` | web_doc | Cookie 态获取知识库目录 TOC |
| `yuque_web_delete_doc` | web_doc | Cookie 态删除文档（移入回收站，v2 被限流时的备用通道） |
| `yuque_web_move_catalog_node` | web_doc | Cookie 态移动目录节点 |
| `yuque_web_copy_catalog_node` | web_doc | Cookie 态复制目录节点 |
| `yuque_web_batch_move_catalog_nodes` | web_doc | Cookie 态批量移动目录节点 |

完整工具文档（含参数和示例）见 [SKILL.md](SKILL.md) 或 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)。

## 与官方对比

| 功能 | 官方 yuque-mcp-server | yuque-ai-mcp |
|---------|--------------------------|--------------|
| 工具数 | 19 | **62** |
| 粒度 | 粗粒度 | **细粒度**（1 端点 = 1 工具） |
| 团队、回收站、上传、统计 | ❌ | ✅ |
| 版本、Diff、跨库复制 | ❌ | ✅ |
| 传输模式 | 仅 stdio | **stdio + HTTP SSE** |
| 配置 | 环境变量 | **config.json**（token + cookie） |
| Skill 层 | ❌ | ✅ 67 指导 |

## 架构

```
server/src/
├── common/              # 公共：config, errors, types, format, validate,
│                        # api-client, web-request, register-tools, copy/export,
│                        # toc-cache（可配置 TTL）, text-utils
├── user/ search/ group/ doc/ toc/ repo/ statistic/
├── note/ recycle/ upload/ board/ mine/ web-doc/
├── index.ts             # stdio 入口
└── http.ts              # HTTP SSE 入口（端口 3099）
```

## 配置

```json
{
  "token": "你的语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "可选，回收站/上传功能需要",
  "ctoken": "可选，从 Cookie 中提取"
}
```

- `toc_cache_ttl_minutes`：TOC 缓存 TTL（分钟），默认 60。调大可减少 API 调用，调小可获取更新鲜的数据。

## 错误处理

统一错误处理，返回结构化错误（HTTP 状态码 + 消息 + 响应摘要）。所有工具共用同一错误管道。

关键错误：
- `book_full` — 知识库超 5000 篇（语雀 API 对超 5000 节点的知识库不可用）
- `401` / `403` — Token/权限问题
- `429` — 限流，自动重试

完整错误码见 [references/api/errors.md](references/api/errors.md)。

## 贡献

```bash
git clone https://github.com/yehuoshun/yuque-ai-mcp.git
cd yuque-ai-mcp/server
npm install
npm run build

# 新增工具清单：
# 1. 创建 server/src/{域}/{工具}.ts
# 2. 在 {域}/index.ts 中 export + 追加到工具数组
# 3. npx tsc
# 4. 重启 HTTP Server + curl health
# 5. 同步 yuque-ai-skills
# 6. 更新 README
# 7. 工具/域数量变化时，同步 awesome 榜单条目
```

[yuque-ai-mcp](https://github.com/yehuoshun/yuque-ai-mcp) 和 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) 保持同步更新。

## 维护

本项目已收录到以下目录。当工具数或域数变化时，需同步对应条目（条目中写了「62 个工具」/「13 个域」）：

- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)
- [zackchewa/awesome-china-mcp](https://github.com/zackchewa/awesome-china-mcp)

## 技术栈

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod（参数校验）
- 语雀 OpenAPI v2 / Web API

## 许可

MIT