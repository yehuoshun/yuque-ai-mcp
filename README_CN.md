<p align="center">
  <img src="https://raw.githubusercontent.com/yehuoshun/yuque-ai-mcp/main/assets/banner.png" width="800" alt="yuque-ai-mcp" />
</p>

<p align="center">
  <h1 align="center">yuque-ai-mcp</h1>
  <p align="center">
    <b>63 个细粒度 MCP 工具，覆盖语雀 OpenAPI 全部能力</b>
  </p>
</p>

<p align="center">
  <a href="https://github.com/yehuoshun/yuque-ai-mcp"><img src="https://img.shields.io/badge/版本-2.7.9-blue" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可-MIT-green" alt="license" /></a>
  <a href="https://github.com/yehuoshun/yuque-ai-skills"><img src="https://img.shields.io/badge/skills-63%20指导-orange" alt="skills" /></a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

基于 [Model Context Protocol](https://modelcontextprotocol.io/) 的语雀全功能 MCP Server。63 个工具，15 个域——每个语雀 OpenAPI 端点一个专用工具。

## 为什么选这个

- **19 → 63 工具** — 比官方 [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) 多 3 倍覆盖
- **双传输模式** — stdio + HTTP SSE，共享注册中心，修改无需重启
- **模块化架构** — 15 个域，barrel export，唯一注册中心
- **完整 API 覆盖** — 团队、回收站、上传、统计、版本、画板——补全官方缺失
- **[Skill 层](https://github.com/yehuoshun/yuque-ai-skills)** — 63 个 AI Agent 使用指导

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
| **mine** | 2 | 书架列表、编辑中心（Cookie 认证） |
| **rss** | 3 | 数据源列表、抓取+去重+写入、定时策略分析 |
| **crawler** | 4 | 抓取、CSS 提取、去重写入、定时策略分析 |
| **kv** | 4 | 增删查列——增量分片，单文档 250KB 上限 |
| **合计** | **63** | |

### 全部 63 个工具

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
| `yuque_rss_list_sources` | rss | 列出所有可用 RSS 数据源及 feed 类型 |
| `yuque_rss_fetch` | rss | 抓取 RSS/Atom Feed，解析后去重写入语雀 |
| `yuque_rss_schedule` | rss | 分析更新频率，生成推荐抓取时间 |
| `yuque_crawl_fetch` | crawler | 抓取网页原始 HTML |
| `yuque_crawl_extract` | crawler | CSS 选择器从 HTML 提取内容 |
| `yuque_crawl_save` | crawler | 去重 + 写入语雀 |
| `yuque_crawl_schedule` | crawler | 分析爬虫抓取频率，生成推荐抓取时间 |
| `yuque_get_book_stacks` | mine | 获取知识库分组（书架）列表 |
| `yuque_get_editor_center` | mine | 获取个人编辑中心全景数据 |
| `yuque_kv_get` | kv | 读取 KV 命名空间的完整 JSON map（分片合并） |
| `yuque_kv_set` | kv | 增量设置 key-value，超 250KB 自动分片 |
| `yuque_kv_delete` | kv | 遍历分片查找并删除 key |
| `yuque_kv_list` | kv | 列出已配置的 KV 命名空间 |

完整工具文档（含参数和示例）见 [SKILL.md](SKILL.md) 或 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)。

## 与官方对比

| 功能 | 官方 yuque-mcp-server | yuque-ai-mcp |
|---------|--------------------------|--------------|
| 工具数 | 19 | **63** |
| 粒度 | 粗粒度 | **细粒度**（1 端点 = 1 工具） |
| 团队、回收站、上传、统计 | ❌ | ✅ |
| 版本、Diff、跨库复制 | ❌ | ✅ |
| 传输模式 | 仅 stdio | **stdio + HTTP SSE** |
| 配置 | 环境变量 | **config.json**（token + cookie） |
| Skill 层 | ❌ | ✅ 63 指导 |

## 架构

```
server/src/
├── common/              # 公共：config, errors, types, format, validate,
│                        # api-client, web-request, register-tools, copy/export/schedule,
│                        # repo-capacity（自动扩容）, toc-cache（可配置 TTL）, text-utils
├── user/ search/ group/ doc/ toc/ repo/ statistic/
├── note/ recycle/ upload/ board/ rss/ crawler/ mine/ kv/
├── index.ts             # stdio 入口
└── http.ts              # HTTP SSE 入口（端口 3099）
```

## 配置

```json
{
  "token": "你的语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "可选，回收站/上传功能需要",
  "ctoken": "可选，从 Cookie 中提取",
  "kv": { "enabled": true },
  "rss": {
    "enabled": true,
    "sources": {
      "cnblogs": {
        "name": "博客园",
        "slug_pattern": "/p/(\\d+)",
        "feeds": {
          "sitehome": { "label": "首页", "url": "https://feed.cnblogs.com/blog/sitehome/rss" }
        }
      }
    },
    "namespaces": {
      "cnblogs": {
        "book_id": [0],
        "kv_slugs": [],
        "schedule_slugs": []
      }
    }
  },
  "crawler": {
    "enabled": true,
    "namespaces": {
      "my-source": {
        "book_id": [0],
        "kv_slugs": [],
        "schedule_slugs": []
      }
    }
  }
}
```

- `book_id`：目标知识库 ID 数组，最后一个为当前活跃仓库。满 5000 篇自动扩容追加。
- `kv_slugs`：KV 去重分片文档（`{book_id}/{doc_id}` 格式）
- `schedule_slugs`：定时策略配置文档
- `toc_cache_ttl_minutes`：TOC 缓存 TTL（分钟），默认 60。调大可减少 API 调用，调小可获取更新鲜的数据。

## 错误处理

统一错误处理，返回结构化错误（HTTP 状态码 + 消息 + 响应摘要）。所有工具共用同一错误管道。

关键错误：
- `book_full` — 知识库超 5000 篇，自动创建新仓库并追加到 `book_id` 数组
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
```

[yuque-ai-mcp](https://github.com/yehuoshun/yuque-ai-mcp) 和 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) 保持同步更新。

## 技术栈

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod（参数校验）
- 语雀 OpenAPI v2 / Web API

## 许可

MIT