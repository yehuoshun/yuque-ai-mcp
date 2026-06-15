# yuque-ai-mcp

语雀全功能 MCP Server，基于 [Model Context Protocol](https://modelcontextprotocol.io/) 协议，提供 47 个细粒度工具，覆盖语雀 OpenAPI 的全部能力（不含已废弃的索引/图谱功能）。

## 与官方版对比

| 对比项 | [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server)（官方） | yuque-ai-mcp（本项目） |
|--------|------|------|
| 工具数量 | 19 个 | **47 个** |
| 工具粒度 | 粗粒度（如 `yuque_list_books`） | **细粒度**（每个 API 端点一个工具） |
| 团队管理 | ❌ 不支持 | ✅ group 域（成员列表/角色变更/删除） |
| 回收站 | ❌ 不支持 | ✅ recycle 域（列表/恢复/彻底删除） |
| 文件上传 | ❌ 不支持 | ✅ upload 域（图片/附件/视频） |
| 统计数据 | ❌ 不支持 | ✅ statistic 域（4 个维度） |
| 文档版本 | ❌ 不支持 | ✅ versions + version_detail |
| 知识库删除 | ❌ 不支持 | ✅ delete_repo |
| 小记删除/恢复 | ❌ 不支持 | ✅ update_note(status=9/0) |
| 架构 | 单体 `src/index.ts` | **模块化**（按域拆分 + 域 barrel + 工具注册中心，11 个域 49 个文件） |
| 配置方式 | 环境变量 `YUQUE_PERSONAL_TOKEN` | **config.json**（Token + Cookie + 会员等级） |
| 安装方式 | `npx yuque-mcp`（npm 包） | 本地 clone + `npm install && npm run build` |
| HTTP 解耦 | ❌ 仅 stdio | ✅ **双模式**：stdio + HTTP SSE（共享注册中心，修改无需重启 Gateway） |
| 配套 Skill 层 | ❌ 无 | ✅ [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)（33 个使用指导） |

## 架构

```
server/
├── src/
│   ├── common/          # 公共模块：配置、错误处理、类型定义、工具注册
│   │   ├── config.ts
│   │   ├── errors.ts
│   │   ├── types.ts
│   │   └── register-tools.ts  # 工具注册中心（唯一真实来源）
│   ├── user/            # 用户信息（含 index.ts barrel）
│   │   ├── index.ts     # 域 barrel（userTools）
│   │   ├── get-user.ts  # GET /api/v2/user
│   │   ├── hello.ts     # GET /api/v2/hello
│   │   └── get-groups.ts # GET /api/v2/users/:id/groups
│   ├── search/          # 搜索（含 index.ts barrel）
│   │   ├── index.ts
│   │   ├── search.ts    # GET /api/v2/search
│   │   └── rag-search.ts   # RAG 增强搜索（关键词过滤 + 并发多路搜索）
│   ├── doc/             # 文档 CRUD（含 index.ts barrel）
│   │   ├── index.ts
│   │   ├── list-docs.ts
│   │   ├── get-doc.ts
│   │   ├── create-doc.ts
│   │   ├── update-doc.ts
│   │   ├── delete-doc.ts
│   │   ├── versions.ts
│   │   ├── version-detail.ts
│   │   ├── diff-doc.ts
│   │   ├── batch-get-docs.ts
│   │   ├── export-common.ts
│   │   ├── export-doc.ts
│   │   ├── embed-url.ts
│   │   ├── import-url.ts
│   │   ├── import-file.ts
│   │   ├── copy-common.ts
│   │   ├── copy-doc.ts
│   │   └── copy-repo.ts
│   ├── repo/            # 知识库 CRUD（含 index.ts barrel）
│   │   ├── index.ts
│   │   ├── list-repos.ts
│   │   ├── get-repo.ts
│   │   ├── create-repo.ts
│   │   ├── update-repo.ts
│   │   ├── delete-repo.ts
│   │   ├── batch-get-repos.ts
│   │   ├── export-repo.ts
│   │   └── copy-repo.ts
│   ├── group/           # 团队成员管理（含 index.ts barrel）
│   ├── toc/             # 目录导航（含 index.ts barrel）
│   ├── statistic/       # 统计数据（含 index.ts barrel）
│   ├── note/            # 小记（含 index.ts barrel）
│   ├── recycle/         # 回收站（含 index.ts barrel）
│   ├── upload/          # 文件上传（含 index.ts barrel）
│   └── board/           # 画板资源（含 index.ts barrel）
│   ├── index.ts         # MCP Server 入口（stdio）
│   └── http.ts           # HTTP Server 入口（SSE）
├── references/api/      # API 文档参考（11 个域）
├── config/              # 配置文件
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
  "membership": "pro",
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

## 工具列表（47 个）

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
| `yuque_embed_url` | 无（纯工具函数） |
| `yuque_batch_get_docs` | 批量 GET（并发，max 20） |
| `yuque_copy_doc` | 单文档跨库复制（LLM 分类 + 内容清洗） |
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

## 错误处理

统一错误处理，API 失败时返回结构化错误（状态码 + 中文描述 + 响应摘要）。详见 `references/api/errors.md`。

## 技术栈

- TypeScript + Node.js
- @modelcontextprotocol/sdk v1.x
- Zod（参数校验）
- 语雀 OpenAPI v2 / Web API

## License

MIT