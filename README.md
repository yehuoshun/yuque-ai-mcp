<p align="center">
  <img src="https://cdn.nlark.com/yuque/0/2025/png/25689388/1749661212345-avatar/8a3b5c7d-1e2f-4a5b-9c7d-8e1f2a3b4c5d.png" width="120" alt="yuque-ai-mcp" />
</p>

<h1 align="center">yuque-ai-mcp</h1>
<p align="center">
  <b>61 fine-grained MCP tools for the full Yuque OpenAPI</b>
</p>

<p align="center">
  <a href="https://github.com/yehuoshun/yuque-ai-mcp"><img src="https://img.shields.io/badge/version-2.7.4-blue" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  <a href="https://github.com/yehuoshun/yuque-ai-skills"><img src="https://img.shields.io/badge/skills-61%20guides-orange" alt="skills" /></a>
</p>

<p align="center">
  <a href="README_CN.md">中文文档</a>
</p>

---

A full-featured Yuque (语雀) MCP Server built on the [Model Context Protocol](https://modelcontextprotocol.io/). Provides 61 fine-grained tools across 15 domains — every Yuque OpenAPI endpoint as a dedicated tool.

## Why

- **19 → 61 tools** — 3x more coverage than the official [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server)
- **Dual transport** — stdio + HTTP SSE, shared registry, zero downtime on reload
- **Modular architecture** — 15 domains, barrel exports, single source of truth registry
- **Full API coverage** — group, recycle, upload, statistics, versions, boards — all the missing pieces
- **[Skill layer](https://github.com/yehuoshun/yuque-ai-skills)** — 61 usage guides for AI agents

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
| **doc** | 14 | CRUD, versions, diff, batch get, import URL/file, cross-book copy, export |
| **repo** | 8 | CRUD, batch get, cross-book copy, full export (TOC-structure + INDEX/GRAPH) |
| **toc** | 3 | Get, update, batch update (createTitle/appendNode/removeNode/moveNode) |
| **search** | 2 | General search + RAG-enhanced search |
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
| **Total** | **61** | |

See [SKILL.md](SKILL.md) or [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) for full tool documentation.

## vs Official

| Feature | Official yuque-mcp-server | yuque-ai-mcp |
|---------|--------------------------|--------------|
| Tools | 19 | **61** |
| Granularity | Coarse | **Fine-grained** (1 tool / endpoint) |
| Group, Recycle, Upload, Statistics | ❌ | ✅ |
| Versions, Diff, Cross-book Copy | ❌ | ✅ |
| Transport | stdio only | **stdio + HTTP SSE** |
| Config | Env var | **config.json** (token + cookie) |
| Skill Layer | ❌ | ✅ 61 guides |

## Architecture

```
server/src/
├── common/              # Shared: config, errors, types, format, validate,
│                        # api-client, web-request, register-tools, copy/export/schedule common,
│                        # repo-capacity (auto-expand), toc-cache (24h TTL), text-utils
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
        "book_id": [80197497],
        "kv_slugs": ["80197550/274164064"],
        "schedule_slugs": []
      }
    }
  },
  "crawler": {
    "enabled": true,
    "namespaces": {
      "my-source": {
        "book_id": [80197497],
        "kv_slugs": ["80197550/274164064"],
        "schedule_slugs": []
      }
    }
  }
}
```

- `book_id`: Target repo ID array — last element is the active repo. Auto-expands when full (5000 docs).
- `kv_slugs`: KV dedup shard docs (`{book_id}/{doc_id}` format)
- `schedule_slugs`: Schedule config docs

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