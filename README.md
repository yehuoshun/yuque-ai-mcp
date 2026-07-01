<p align="center">
  <img src="https://raw.githubusercontent.com/yehuoshun/yuque-ai-mcp/main/assets/banner.png" width="800" alt="yuque-ai-mcp" />
</p>

<h1 align="center">yuque-ai-mcp</h1>
<p align="center">
  <b>63 fine-grained MCP tools for the full Yuque OpenAPI</b>
</p>

<p align="center">
  <a href="https://github.com/yehuoshun/yuque-ai-mcp"><img src="https://img.shields.io/badge/version-2.8.0-blue" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  <a href="https://github.com/yehuoshun/yuque-ai-skills"><img src="https://img.shields.io/badge/skills-63%20guides-orange" alt="skills" /></a>
</p>

<p align="center">
  <a href="README_CN.md">中文文档</a>
</p>

---

A full-featured Yuque (语雀) MCP Server built on the [Model Context Protocol](https://modelcontextprotocol.io/). Provides 63 fine-grained tools across 15 domains — every Yuque OpenAPI endpoint as a dedicated tool.

## Why

- **19 → 63 tools** — 3x more coverage than the official [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server)
- **Dual transport** — stdio + HTTP SSE, shared registry, zero downtime on reload
- **Modular architecture** — 15 domains, barrel exports, single source of truth registry
- **Full API coverage** — group, recycle, upload, statistics, versions, boards — all the missing pieces
- **[Skill layer](https://github.com/yehuoshun/yuque-ai-skills)** — 63 usage guides for AI agents

## Table of Contents

- [Quick Start](#quick-start)
- [Tool Overview](#tool-overview)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

```bash
cd server
npm install
npm run build

# Copy config template
cp config/config.example.json config/config.json
# Edit config.json with your Yuque API token

# Run
npm start              # stdio mode
npm run dev:http       # HTTP SSE mode (http://localhost:3099)
```

> **Note**: `npm run dev:http` uses `tsx` for hot-reload during development.

## Tool Overview

| Domain | Tools | Highlights |
|--------|-------|------------|
| **doc** | 15 | CRUD, versions, diff, batch get, import URL/file, cross-book copy, export, resource download |
| **repo** | 8 | CRUD, batch get, cross-book copy, full export (TOC-structure + INDEX/GRAPH) |
| **toc** | 3 | Get, update, batch update (createTitle/appendNode/removeNode/moveNode) |
| **search** | 3 | General search + RAG-enhanced search + Cookie web search |
| **user** | 3 | User info, heartbeat, group list |
| **group** | 3 | Member list, role change, delete member |
| **statistic** | 4 | Group/member/repo/doc statistics |
| **note** | 4 | CRUD + soft-delete/restore |
| **recycle** | 3 | List, restore, destroy (Cookie auth) |
| **upload** | 1 | File upload to Yuque CDN (Cookie auth) |
| **board** | 3 | Mindmap, flowchart, architecture diagram |
| **mine** | 2 | Book stacks, editor center (Cookie auth) |
| **rss** | 3 | Source list, fetch + dedup + save, schedule analysis |
| **crawler** | 4 | Fetch, CSS extract, dedup save, schedule analysis |
| **kv** | 4 | Get, set, delete, list — incremental sharding, 250KB/doc limit |
| **Total** | **63** | |

### All 63 Tools

| Tool | Domain | Description |
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

See [SKILL.md](SKILL.md) or [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) for full tool documentation with parameters and examples.

## vs Official

| Feature | Official yuque-mcp-server | yuque-ai-mcp |
|---------|--------------------------|--------------|
| Tools | 19 | **63** |
| Granularity | Coarse | **Fine-grained** (1 tool / endpoint) |
| Group, Recycle, Upload, Statistics | ❌ | ✅ |
| Versions, Diff, Cross-book Copy | ❌ | ✅ |
| Transport | stdio only | **stdio + HTTP SSE** |
| Config | Env var | **config.json** (token + cookie) |
| Skill Layer | ❌ | ✅ 63 guides |

## Architecture

```
server/src/
├── common/              # Shared: config, errors, types, format, validate,
│                        # api-client, web-request, register-tools, copy/export/schedule common,
│                        # repo-capacity (auto-expand), toc-cache (configurable TTL), text-utils
├── user/ search/ group/ doc/ toc/ repo/ statistic/
├── note/ recycle/ upload/ board/ rss/ crawler/ mine/ kv/
├── index.ts             # stdio entry
└── http.ts              # HTTP SSE entry (port 3099)
```

## Configuration

```json
{
  "token": "Your Yuque API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "Optional, for recycle/upload features",
  "ctoken": "Optional, extracted from Cookie",
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

- `book_id`: Target repo ID array — last element is the active repo. Auto-expands when full (5000 docs).
- `kv_slugs`: KV dedup shard docs (`{book_id}/{doc_id}` format)
- `schedule_slugs`: Schedule config docs
- `toc_cache_ttl_minutes`: TOC cache TTL in minutes (default 60). Set higher to reduce API calls, lower for fresher data.

## Error Handling

Unified error handling with structured responses (HTTP status + message + response summary). All tools share the same error pipeline.

Key errors:
- `book_full` — Auto-expands by creating a new repo and appending to the `book_id` array
- `401` / `403` — Token/permission issues
- `429` — Rate limit with automatic retry

See [references/api/errors.md](references/api/errors.md) for the full error code reference.

## Contributing

```bash
git clone https://github.com/yehuoshun/yuque-ai-mcp.git
cd yuque-ai-mcp/server
npm install
npm run build

# New tool checklist:
# 1. Create server/src/{domain}/{tool}.ts
# 2. Export in {domain}/index.ts + append to tools array
# 3. npx tsc
# 4. Restart HTTP server + curl health
# 5. Sync yuque-ai-skills
# 6. Update README
```

Both [yuque-ai-mcp](https://github.com/yehuoshun/yuque-ai-mcp) and [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) are kept in sync.

## Tech Stack

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod (validation)
- Yuque OpenAPI v2 / Web API

## License

MIT