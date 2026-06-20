# yuque-ai-mcp

语雀全功能 MCP Server，基于 [Model Context Protocol](https://modelcontextprotocol.io/) 协议，提供 61 个细粒度工具，覆盖语雀 OpenAPI 的全部能力。

## 与官方版对比

| 对比项 | [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server)（官方） | yuque-ai-mcp（本项目） |
|--------|------|------|
| 工具数量 | 19 个 | **61 个** |
| 工具粒度 | 粗粒度（如 `yuque_list_books`） | **细粒度**（每个 API 端点一个工具） |
| 团队管理 | ❌ 不支持 | ✅ group 域（成员列表/角色变更/删除） |
| 回收站 | ❌ 不支持 | ✅ recycle 域（列表/恢复/彻底删除） |
| 文件上传 | ❌ 不支持 | ✅ upload 域（图片/附件/视频） |
| 统计数据 | ❌ 不支持 | ✅ statistic 域（4 个维度） |
| 文档版本 | ❌ 不支持 | ✅ versions + version_detail |
| 知识库删除 | ❌ 不支持 | ✅ delete_repo |
| 小记删除/恢复 | ❌ 不支持 | ✅ update_note(status=9/0) |
| 架构 | 单体 `src/index.ts` | **模块化**（按域拆分 + 域 barrel + 工具注册中心，15 个域） |
| 配置方式 | 环境变量 `YUQUE_PERSONAL_TOKEN` | **config.json**（Token + Cookie） |
| 安装方式 | `npx yuque-mcp`（npm 包） | 本地 clone + `npm install && npm run build` |
| HTTP 解耦 | ❌ 仅 stdio | ✅ **双模式**：stdio + HTTP SSE（共享注册中心，修改无需重启 Gateway） |
| 配套 Skill 层 | ❌ 无 | ✅ [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)（61 个使用指导） |

## 架构

```
server/
├── src/
│   ├── common/              # 公共模块
│   │   ├── config.ts            # 配置加载 + autoSlug() + parseSlug()/buildSlugStr()
│   │   ├── errors.ts            # 错误处理 + isBookFullError()
│   │   ├── types.ts             # 类型定义
│   │   ├── format.ts            # 输出格式化 + handleApiCall()
│   │   ├── validate.ts          # 参数校验
│   │   ├── api-client.ts        # HTTP 请求层（Token 认证，自动重试）
│   │   ├── web-request.ts       # Web API 请求层（Cookie 认证）
│   │   ├── register-tools.ts    # 工具注册中心（唯一真实来源）
│   │   ├── copy-common.ts       # 跨库复制公共逻辑
│   │   ├── export-common.ts     # 导出公共逻辑
│   │   ├── schedule-common.ts   # 定时策略公共逻辑
│   │   ├── repo-capacity.ts     # 仓库满了自动扩容
│   │   ├── toc-cache.ts         # TOC 缓存（24h TTL）
│   │   └── text-utils.ts        # HTML 实体编解码
│   ├── user/                # 用户信息（3 工具）
│   ├── search/              # 搜索（2 工具）
│   ├── group/               # 团队管理（3 工具）
│   ├── doc/                 # 文档 CRUD（14 工具）
│   ├── toc/                 # 目录导航（3 工具）
│   ├── repo/                # 知识库管理（8 工具）
│   ├── statistic/           # 统计数据（4 工具）
│   ├── note/                # 小记（4 工具）
│   ├── recycle/             # 回收站（3 工具）
│   ├── upload/              # 文件上传（1 工具）
│   ├── board/               # 画板资源（3 工具）
│   ├── rss/                 # RSS 抓取（3 工具）
│   ├── crawler/             # 网页爬虫（4 工具）
│   ├── mine/                # 个人数据（2 工具）
│   ├── kv/                  # KV 键值存储（4 工具）
│   ├── index.ts             # MCP Server 入口（stdio）
│   └── http.ts              # HTTP Server 入口（SSE，端口 3099）
├── config/
│   ├── config.example.json
│   └── config.json
├── references/api/          # API 文档参考（17 个域）
└── package.json
```

## 快速开始

### 安装

```bash
cd server
npm install
npm run build
```

### 配置

```bash
cp config/config.example.json config/config.json
```

编辑 `config/config.json`：

```json
{
  "token": "你的语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "cookie": "可选，回收站/上传功能需要",
  "ctoken": "可选，从 Cookie 中提取"
}
```

### 运行

```bash
# 生产模式（编译后运行）
npm start

# 开发模式（tsx 热重载，无需编译）
npm run dev        # stdio 模式
npm run dev:http   # HTTP SSE 模式（端口 3099）
```

## 工具列表（61 个）

### user — 用户信息
| 工具 | 端点 |
|------|------|
| `yuque_get_user` | `GET /api/v2/user` |
| `yuque_hello` | `GET /api/v2/hello` |
| `yuque_get_user_groups` | `GET /api/v2/users/:id/groups` |

### search — 搜索
| 工具 | 端点 |
|------|------|
| `yuque_search` | `GET /api/v2/search` |
| `yuque_rag_search` | RAG 增强搜索：关键词过滤 + 并发多路搜索 + 文档内容获取 |

### doc — 文档
| 工具 | 端点 |
|------|------|
| `yuque_list_docs` | `GET /api/v2/repos/:id/docs` |
| `yuque_get_doc` | `GET /api/v2/repos/docs/:id` |
| `yuque_export_doc` | 单篇导出 Markdown（含图片下载/降级） |
| `yuque_create_doc` | `POST /api/v2/repos/:id/docs` |
| `yuque_update_doc` | `PUT /api/v2/repos/:id/docs/:id` |
| `yuque_delete_doc` | `DELETE /api/v2/repos/:id/docs/:id` |
| `yuque_get_doc_versions` | `GET /api/v2/doc_versions` |
| `yuque_get_doc_version_detail` | `GET /api/v2/doc_versions/:id` |
| `yuque_embed_url` | 生成文档嵌入阅读器 URL |
| `yuque_batch_get_docs` | 批量 GET（并发，max 20） |
| `yuque_copy_doc` | 单文档跨库复制 |
| `yuque_import_url` | 从网页 URL 导入（抓取+清洗+创建） |
| `yuque_import_file` | 从本地文件导入（direct/upload_assets/embed_assets） |
| `yuque_diff_doc_versions` | 版本内容 Diff（逐行对比，本地计算） |

### repo — 知识库
| 工具 | 端点 |
|------|------|
| `yuque_list_repos` | `GET /api/v2/users/:login/repos` |
| `yuque_get_repo` | `GET /api/v2/repos/:id` |
| `yuque_create_repo` | `POST /api/v2/users/:login/repos` |
| `yuque_update_repo` | `PUT /api/v2/repos/:id` |
| `yuque_delete_repo` | `DELETE /api/v2/repos/:id` |
| `yuque_batch_get_repos` | 批量 GET（并发，max 20） |
| `yuque_export_repo` | 批量导出 Markdown（按TOC目录结构 + 标题命名 + INDEX/GRAPH） |
| `yuque_copy_repo` | 批量跨库复制（LLM 分类 + 目录重建） |

### group — 团队
| 工具 | 端点 |
|------|------|
| `yuque_get_group_users` | `GET /api/v2/groups/:login/users` |
| `yuque_update_group_user` | `PUT /api/v2/groups/:login/users/:id` |
| `yuque_delete_group_user` | `DELETE /api/v2/groups/:login/users/:id` |

### toc — 目录
| 工具 | 端点 |
|------|------|
| `yuque_get_toc` | `GET /api/v2/repos/:id/toc` |
| `yuque_update_toc` | `PUT /api/v2/repos/:id/toc` |
| `yuque_batch_update_toc` | `PUT /api/v2/repos/:id/toc` (批量) |

### statistic — 统计
| 工具 | 端点 |
|------|------|
| `yuque_get_group_statistics` | `GET /api/v2/groups/:login/statistics` |
| `yuque_get_book_statistics` | `GET /api/v2/groups/:login/statistics/books` |
| `yuque_get_doc_statistics` | `GET /api/v2/groups/:login/statistics/docs` |
| `yuque_get_member_statistics` | `GET /api/v2/groups/:login/statistics/members` |

### note — 小记
| 工具 | 端点 | 说明 |
|------|------|------|
| `yuque_list_notes` | `GET /api/v2/notes` | 获取小记列表 |
| `yuque_get_note` | `GET /api/v2/notes/:id` | 获取小记详情 |
| `yuque_create_note` | `POST /api/v2/notes` | 创建小记 |
| `yuque_update_note` | `PUT /api/v2/notes/:id` | 更新小记，也支持软删除（`status=9`）和恢复（`status=0`）。删除需 `confirm='DELETE'` |

### mine — 个人数据（Web API，Cookie 认证）
| 工具 | 端点 |
|------|------|
| `yuque_get_book_stacks` | `GET /api/mine/book_stacks` |
| `yuque_get_editor_center` | `GET /api/mine/editor_center` |

### recycle — 回收站
| 工具 | 端点 | 认证 |
|------|------|------|
| `yuque_list_recycles` | `GET /api/mine/recycles` | Cookie |
| `yuque_restore_recycle` | `PUT /api/mine/recycles/:id/restore` | Cookie |
| `yuque_destroy_recycle` | `DELETE /api/mine/recycles/:id` | Cookie |

### upload — 上传
| 工具 | 端点 | 认证 |
|------|------|------|
| `yuque_upload_attachment` | `POST /api/upload/attach` | Cookie |

### board — 画板资源
| 工具 | 端点 |
|------|------|
| `yuque_get_board` | `GET /api/v2/yfm/boards` |
| `yuque_create_board` | `POST /api/v2/yfm/boards` |
| `yuque_update_board` | `PUT /api/v2/yfm/boards` |

### rss — RSS 抓取
| 工具 | 说明 |
|------|------|
| `yuque_rss_list_sources` | 列出所有可用 RSS 数据源及 feed 类型 |
| `yuque_rss_fetch` | 抓取 RSS/Atom Feed，解析条目，语雀 KV 去重后写入知识库，自动加入目录 |
| `yuque_rss_schedule` | 分析最近更新频率，生成推荐抓取时间并写入配置知识库，支持 KV 兜底 |

RSS 抓取需在 `config.json` 中配置 `rss` 和 `kv` 段，指定目标知识库、去重 KV 和定时策略文档。
配置使用 slug 格式 `{book_id}/{doc_id}` 直接定位文档：

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

- `book_id`：目标知识库 ID 数组，最后一个为当前活跃仓库（满了自动扩容追加）
- `kv_slugs`：KV 去重分片文档，数组支持多分片（单文档上限 250KB，超出自动创建新分片）
- `schedule_slugs`：定时策略配置文档，数组支持多 feed
- 去重策略：`kv.enabled=true` 时，使用 KV 域增量分片去重

### crawler — 网页爬虫
| 工具 | 说明 |
|------|------|
| `yuque_crawl_fetch` | 抓取网页原始 HTML，返回响应头+状态码 |
| `yuque_crawl_extract` | CSS 选择器从 HTML 提取内容/属性 |
| `yuque_crawl_save` | 去重 + 写入语雀（接收 Agent 清洗后的内容） |
| `yuque_crawl_schedule` | 分析爬虫最近抓取频率，生成推荐抓取时间并写入配置知识库 |

爬虫需在 `config.json` 中配置 `crawler` 段，与 RSS 共用 kv_slugs/schedule_slugs 格式：

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

目标知识库优先级：`target_repo` 参数 → `crawler.namespaces.{source}.book_id`。
去重依赖 `kv.enabled=true`，使用 KV 域增量分片去重。

### kv — KV 键值存储
| 工具 | 说明 |
|------|------|
| `yuque_kv_get` | 读取命名空间的完整 JSON key-value map（分片合并） |
| `yuque_kv_set` | 增量设置 key-value，超 250KB 自动分片 |
| `yuque_kv_delete` | 遍历分片查找并删除 key |
| `yuque_kv_list` | 列出 config.json 中已配置的命名空间 |

KV 存储方案：增量分片，配置分散在 rss/crawler 的 namespaces 中（`kv_slugs` 数组）。
单文档 body 上限 250KB，超出自动创建新分片。RSS 和 crawler 的去重都依赖此域。
KV 工具调用需指定 `domain` 参数（rss/crawler），定位对应 namespace 的 `kv_slugs`。

## 错误处理

统一错误处理，API 失败时返回结构化错误（状态码 + 中文描述 + 响应摘要）。
- `book_full`：知识库超过 5000 篇文档，自动扩容创建新仓库并追加到 `book_id` 数组。
详见 `references/api/errors.md`。

## 技术栈

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod（参数校验）
- 语雀 OpenAPI v2 / Web API

## License

MIT