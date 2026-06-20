# yuque-ai-mcp

A full-featured Yuque MCP Server with 61 fine-grained tools covering the entire Yuque OpenAPI, built on the [Model Context Protocol](https://modelcontextprotocol.io/).

[中文文档 / Chinese Documentation](README_CN.md)

## vs Official

| Feature | [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) (Official) | yuque-ai-mcp (This Project) |
|--------|------|------|
| Tools | 19 | **61** |
| Granularity | Coarse (e.g. `yuque_list_books`) | **Fine-grained** (one tool per API endpoint) |
| Group Management | ❌ | ✅ group domain (list/role/delete) |
| Recycle Bin | ❌ | ✅ recycle domain (list/restore/destroy) |
| File Upload | ❌ | ✅ upload domain (image/attachment/video) |
| Statistics | ❌ | ✅ statistic domain (4 dimensions) |
| Doc Versions | ❌ | ✅ versions + version_detail |
| Delete Repo | ❌ | ✅ delete_repo |
| Note Delete/Restore | ❌ | ✅ update_note(status=9/0) |
| Architecture | Monolithic `src/index.ts` | **Modular** (domain-split + barrel exports + registry, 15 domains) |
| Config | Env var `YUQUE_PERSONAL_TOKEN` | **config.json** (Token + Cookie) |
| Install | `npx yuque-mcp` (npm package) | Local clone + `npm install && npm run build` |
| HTTP Decoupling | ❌ stdio only | ✅ **Dual mode**: stdio + HTTP SSE (shared registry) |
| Skill Layer | ❌ | ✅ [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) (61 guides) |

## Architecture

```
server/
├── src/
│   ├── common/              # Shared modules
│   │   ├── config.ts            # Config loading + autoSlug() + parseSlug()/buildSlugStr()
│   │   ├── errors.ts            # Error handling + isBookFullError()
│   │   ├── types.ts             # Type definitions
│   │   ├── format.ts            # Output formatting + handleApiCall()
│   │   ├── validate.ts          # Parameter validation
│   │   ├── api-client.ts        # HTTP request layer (Token auth, auto-retry)
│   │   ├── web-request.ts       # Web API request layer (Cookie auth)
│   │   ├── register-tools.ts    # Tool registry (single source of truth)
│   │   ├── copy-common.ts       # Cross-book copy logic
│   │   ├── export-common.ts     # Export logic
│   │   ├── schedule-common.ts   # Schedule strategy logic
│   │   ├── repo-capacity.ts     # Auto-expand when repo is full
│   │   ├── toc-cache.ts         # TOC cache (24h TTL)
│   │   └── text-utils.ts        # HTML entity encode/decode
│   ├── user/                # User (3 tools)
│   ├── search/              # Search (2 tools)
│   ├── group/               # Group (3 tools)
│   ├── doc/                 # Doc (14 tools)
│   ├── toc/                 # TOC (3 tools)
│   ├── repo/                # Repo (8 tools)
│   ├── statistic/           # Statistics (4 tools)
│   ├── note/                # Note (4 tools)
│   ├── recycle/             # Recycle (3 tools)
│   ├── upload/              # Upload (1 tool)
│   ├── board/               # Board (3 tools)
│   ├── rss/                 # RSS (3 tools)
│   ├── crawler/             # Crawler (4 tools)
│   ├── mine/                # Mine (2 tools)
│   ├── kv/                  # KV Store (4 tools)
│   ├── index.ts             # MCP Server entry (stdio)
│   └── http.ts              # HTTP Server entry (SSE, port 3099)
├── config/
│   ├── config.example.json
│   └── config.json
├── references/api/          # API reference docs (17 domains)
└── package.json
```

## Quick Start

### Install

```bash
cd server
npm install
npm run build
```

### Config

```bash
cp config/config.example.json config/config.json
```

Edit `config/config.json`:

```json
{
  "token": "Your Yuque API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "Optional, for recycle/upload features",
  "ctoken": "Optional, extracted from Cookie"
}
```

### Run

```bash
# Production (compiled)
npm start

# Development (tsx hot-reload)
npm run dev        # stdio mode
npm run dev:http   # HTTP SSE mode (port 3099)
```

## Tool List (61)

### user — User
| Tool | Endpoint |
|------|------|
| `yuque_get_user` | `GET /api/v2/user` |
| `yuque_hello` | `GET /api/v2/hello` |
| `yuque_get_user_groups` | `GET /api/v2/users/:id/groups` |

### search — Search
| Tool | Endpoint |
|------|------|
| `yuque_search` | `GET /api/v2/search` |
| `yuque_rag_search` | RAG-enhanced search: keyword filter + concurrent multi-path + content fetch |

### doc — Doc
| Tool | Endpoint |
|------|------|
| `yuque_list_docs` | `GET /api/v2/repos/:id/docs` |
| `yuque_get_doc` | `GET /api/v2/repos/docs/:id` |
| `yuque_export_doc` | Single doc export to Markdown (with image download/fallback) |
| `yuque_create_doc` | `POST /api/v2/repos/:id/docs` |
| `yuque_update_doc` | `PUT /api/v2/repos/:id/docs/:id` |
| `yuque_delete_doc` | `DELETE /api/v2/repos/:id/docs/:id` |
| `yuque_get_doc_versions` | `GET /api/v2/doc_versions` |
| `yuque_get_doc_version_detail` | `GET /api/v2/doc_versions/:id` |
| `yuque_embed_url` | Generate embed reader URL |
| `yuque_batch_get_docs` | Batch GET (concurrent, max 20) |
| `yuque_copy_doc` | Single doc cross-book copy |
| `yuque_import_url` | Import from web URL (fetch + clean + create) |
| `yuque_import_file` | Import from local file (direct/upload_assets/embed_assets) |
| `yuque_diff_doc_versions` | Version diff (line-by-line, local computation) |

### repo — Repo
| Tool | Endpoint |
|------|------|
| `yuque_list_repos` | `GET /api/v2/users/:login/repos` |
| `yuque_get_repo` | `GET /api/v2/repos/:id` |
| `yuque_create_repo` | `POST /api/v2/users/:login/repos` |
| `yuque_update_repo` | `PUT /api/v2/repos/:id` |
| `yuque_delete_repo` | `DELETE /api/v2/repos/:id` |
| `yuque_batch_get_repos` | Batch GET (concurrent, max 20) |
| `yuque_export_repo` | Batch export to Markdown (TOC structure + named + INDEX/GRAPH) |
| `yuque_copy_repo` | Batch cross-book copy (LLM classification + TOC rebuild) |

### group — Group
| Tool | Endpoint |
|------|------|
| `yuque_get_group_users` | `GET /api/v2/groups/:login/users` |
| `yuque_update_group_user` | `PUT /api/v2/groups/:login/users/:id` |
| `yuque_delete_group_user` | `DELETE /api/v2/groups/:login/users/:id` |

### toc — TOC
| Tool | Endpoint |
|------|------|
| `yuque_get_toc` | `GET /api/v2/repos/:id/toc` |
| `yuque_update_toc` | `PUT /api/v2/repos/:id/toc` |
| `yuque_batch_update_toc` | `PUT /api/v2/repos/:id/toc` (batch) |

### statistic — Statistics
| Tool | Endpoint |
|------|------|
| `yuque_get_group_statistics` | `GET /api/v2/groups/:login/statistics` |
| `yuque_get_book_statistics` | `GET /api/v2/groups/:login/statistics/books` |
| `yuque_get_doc_statistics` | `GET /api/v2/groups/:login/statistics/docs` |
| `yuque_get_member_statistics` | `GET /api/v2/groups/:login/statistics/members` |

### note — Note
| Tool | Endpoint | Notes |
|------|------|------|
| `yuque_list_notes` | `GET /api/v2/notes` | List notes |
| `yuque_get_note` | `GET /api/v2/notes/:id` | Get note detail |
| `yuque_create_note` | `POST /api/v2/notes` | Create note |
| `yuque_update_note` | `PUT /api/v2/notes/:id` | Update note, also supports soft-delete (`status=9`) and restore (`status=0`). Delete requires `confirm='DELETE'` |

### mine — Mine (Web API, Cookie auth)
| Tool | Endpoint |
|------|------|
| `yuque_get_book_stacks` | `GET /api/mine/book_stacks` |
| `yuque_get_editor_center` | `GET /api/mine/editor_center` |

### recycle — Recycle
| Tool | Endpoint | Auth |
|------|------|------|
| `yuque_list_recycles` | `GET /api/mine/recycles` | Cookie |
| `yuque_restore_recycle` | `PUT /api/mine/recycles/:id/restore` | Cookie |
| `yuque_destroy_recycle` | `DELETE /api/mine/recycles/:id` | Cookie |

### upload — Upload
| Tool | Endpoint | Auth |
|------|------|------|
| `yuque_upload_attachment` | `POST /api/upload/attach` | Cookie |

### board — Board
| Tool | Endpoint |
|------|------|
| `yuque_get_board` | `GET /api/v2/yfm/boards` |
| `yuque_create_board` | `POST /api/v2/yfm/boards` |
| `yuque_update_board` | `PUT /api/v2/yfm/boards` |

### rss — RSS
| Tool | Description |
|------|------|
| `yuque_rss_list_sources` | List all available RSS sources and feed types |
| `yuque_rss_fetch` | Fetch RSS/Atom feed, parse entries, dedup via KV, save to Yuque repo, auto-add to TOC |
| `yuque_rss_schedule` | Analyze update frequency, generate recommended fetch interval, write to config repo |

RSS requires `rss` and `kv` sections in `config.json`. Uses slug format `{book_id}/{doc_id}`:

```json
{
  "kv": {
    "enabled": true
  },
  "rss": {
    "enabled": true,
    "namespaces": {
      "cnblogs": {
        "book_id": [80197497],
        "kv_slugs": ["80197550/274164064"],
        "schedule_slugs": []
      }
    }
  }
}
```

- `book_id`: Target repo ID array, last element is the active repo (auto-expands when full)
- `kv_slugs`: KV dedup shard docs, array supports multiple shards (250KB limit per doc)
- `schedule_slugs`: Schedule config docs, array supports multiple feeds
- Dedup: when `kv.enabled=true`, uses KV domain incremental shard dedup

### crawler — Crawler
| Tool | Description |
|------|------|
| `yuque_crawl_fetch` | Fetch raw HTML, returns headers + status |
| `yuque_crawl_extract` | CSS selector extraction from HTML |
| `yuque_crawl_save` | Dedup + save to Yuque (receives Agent-cleaned content) |
| `yuque_crawl_schedule` | Analyze crawl frequency, generate recommended schedule |

Crawler requires `crawler` section in `config.json`, shares kv_slugs/schedule_slugs format with RSS:

```json
{
  "crawler": {
    "enabled": true,
    "namespaces": {
      "cnblogs": {
        "book_id": [80197497],
        "kv_slugs": ["80197550/274164064"],
        "schedule_slugs": []
      }
    }
  }
}
```

Target repo priority: `target_repo` param → `crawler.namespaces.{source}.book_id`.
Dedup requires `kv.enabled=true`.

### kv — KV Store
| Tool | Description |
|------|------|
| `yuque_kv_get` | Read full JSON key-value map for a namespace (shard merging) |
| `yuque_kv_set` | Incremental key-value set, auto-shard at 250KB |
| `yuque_kv_delete` | Iterate shards to find and delete key |
| `yuque_kv_list` | List configured namespaces from config.json |

KV storage: incremental sharding, config in rss/crawler namespaces (`kv_slugs` array).
Single doc body limit 250KB, auto-creates new shards on overflow. RSS and crawler dedup both depend on this domain.
KV tools require `domain` param (rss/crawler) to locate the namespace's `kv_slugs`.

## Error Handling

Unified error handling with structured responses (status code + description + summary).
- `book_full`: Auto-expand when repo exceeds 5000 docs — creates a new repo and appends to the `book_id` array.
See `references/api/errors.md` for details.

## Tech Stack

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod (parameter validation)
- Yuque OpenAPI v2 / Web API

## License

MIT