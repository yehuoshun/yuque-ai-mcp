<p align="center">
  <h1 align="center">yuque-ai-mcp</h1>
  <p align="center">
    <b>61 个细粒度 MCP 工具，覆盖语雀 OpenAPI 全部能力</b>
  </p>
</p>

<p align="center">
  <a href="https://github.com/yehuoshun/yuque-ai-mcp"><img src="https://img.shields.io/badge/版本-2.7.4-blue" alt="version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可-MIT-green" alt="license" /></a>
  <a href="https://github.com/yehuoshun/yuque-ai-skills"><img src="https://img.shields.io/badge/skills-61%20指导-orange" alt="skills" /></a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

基于 [Model Context Protocol](https://modelcontextprotocol.io/) 的语雀全功能 MCP Server。61 个工具，15 个域——每个语雀 OpenAPI 端点一个专用工具。

## 为什么选这个

- **19 → 61 工具** — 比官方 [yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) 多 3 倍覆盖
- **双传输模式** — stdio + HTTP SSE，共享注册中心，修改无需重启
- **模块化架构** — 15 个域，barrel export，唯一注册中心
- **完整 API 覆盖** — 团队、回收站、上传、统计、版本、画板——补全官方缺失
- **[Skill 层](https://github.com/yehuoshun/yuque-ai-skills)** — 61 个 AI Agent 使用指导

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
| **doc** | 14 | CRUD、版本管理、Diff、批量获取、URL/文件导入、跨库复制、导出 |
| **repo** | 8 | CRUD、批量获取、跨库复制、全量导出（TOC 结构 + INDEX/GRAPH） |
| **toc** | 3 | 获取、更新、批量更新（createTitle/appendNode/removeNode/moveNode） |
| **search** | 2 | 通用搜索 + RAG 增强搜索 |
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
| **合计** | **61** | |

完整工具文档见 [SKILL.md](SKILL.md) 或 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)。

## 与官方对比

| 功能 | 官方 yuque-mcp-server | yuque-ai-mcp |
|---------|--------------------------|--------------|
| 工具数 | 19 | **61** |
| 粒度 | 粗粒度 | **细粒度**（1 端点 = 1 工具） |
| 团队、回收站、上传、统计 | ❌ | ✅ |
| 版本、Diff、跨库复制 | ❌ | ✅ |
| 传输模式 | 仅 stdio | **stdio + HTTP SSE** |
| 配置 | 环境变量 | **config.json**（token + cookie） |
| Skill 层 | ❌ | ✅ 61 指导 |

## 架构

```
server/src/
├── common/              # 公共：config, errors, types, format, validate,
│                        # api-client, web-request, register-tools, copy/export/schedule,
│                        # repo-capacity（自动扩容）, toc-cache（24h TTL）, text-utils
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

- `book_id`：目标知识库 ID 数组，最后一个为当前活跃仓库。满 5000 篇自动扩容追加。
- `kv_slugs`：KV 去重分片文档（`{book_id}/{doc_id}` 格式）
- `schedule_slugs`：定时策略配置文档

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