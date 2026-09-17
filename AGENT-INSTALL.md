# AGENT-INSTALL.md — yuque-ai-mcp 安装指南

## 概述

yuque-ai-mcp 是一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的语雀全功能 MCP Server。

当前版本：**v2.13.3** | 工具数：**73** | 域：**16**

## 前置条件

| 要求 | 说明 |
|------|------|
| Node.js | ≥ 18.x（推荐 20+） |
| npm | 随 Node.js 自带 |
| 语雀账号 | 需要 API Token |
| git | 克隆仓库用 |

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/yehuoshun/yuque-ai-mcp.git
cd yuque-ai-mcp/server
```

### 2. 安装依赖

```bash
npm install
```

### 3. 编译

```bash
npm run build
```

编译产物输出到 `server/dist/`。

### 4. 配置

```bash
# 复制示例配置文件
cp ../config/config.example.json ../config/config.json
```

编辑 `config/config.json`：

```json
{
  "token": "你的语雀 API Token",
  "api_base": "https://www.yuque.com/api/v2",
  "toc_cache_ttl_minutes": 60,
  "cookie": "可选，回收站/上传功能需要。浏览器登录后 F12 → Application → Cookies → 复制完整 Cookie 字符串",
  "ctoken": "可选，从 Cookie 中提取 yuque_ctoken 的值",
  "rss": {
    "enabled": true,
    "sources": {
      "cnblogs": {
        "name": "博客园",
        "feeds": {
          "sitehome": { "label": "首页最新", "url": "https://feed.cnblogs.com/blog/sitehome/rss" },
          "user": {
            "label": "用户博客",
            "url_template": "https://feed.cnblogs.com/blog/u/{username}/rss",
            "params_schema": { "username": { "type": "string", "description": "博客园用户名", "required": true } }
          }
        }
      }
    },
    "namespaces": {
      "cnblogs": { "book_id": [0], "kv_slugs": [], "schedule_slugs": [] }
    }
  },
  "kv": { "enabled": true },
  "crawler": {
    "enabled": true,
    "namespaces": {
      "my-source": { "book_id": [0], "kv_slugs": [], "schedule_slugs": [] }
    }
  }
}
```

> ⚠️ `book_id` 是数组，最后一个元素为当前活跃仓库。满 5000 篇自动扩容追加。`toc_cache_ttl_minutes` 控制 TOC 缓存 TTL（默认 60 分钟），调高减少 API 调用，调低获取更新鲜数据。

#### 获取 Token

1. 登录 [语雀](https://www.yuque.com)
2. 进入个人设置 → [Token](https://www.yuque.com/settings/tokens)
3. 创建 Token，至少勾选 `scope:read` 和 `scope:write`

#### 获取 Cookie（可选）

仅回收站和文件上传功能需要：

1. 浏览器登录 [yuque.com](https://www.yuque.com)
2. F12 → Application → Cookies → 复制完整 Cookie 字符串
3. 从 Cookie 中找到 `yuque_ctoken` 的值填入 `ctoken`

### 5. 启动

```bash
# Stdio 模式（生产）
npm start

# Stdio 模式（开发，tsx 热重载）
npm run dev

# HTTP SSE 模式（开发，端口 3099，tsx 热重载）
npm run dev:http

# HTTP SSE 模式（生产，端口 3099）
npm run start:http
```

#### 启动模式

| 模式 | 命令 | 场景 | 说明 |
|------|------|------|------|
| **stdio**（生产） | `npm start` | MCP Client 子进程启动 | 标准 MCP 协议，适合 Claude Desktop、Cursor、OpenClaw 等 |
| **stdio**（开发） | `npm run dev` | 开发调试 | tsx 热重载 |
| **HTTP SSE**（开发） | `npm run dev:http` | 开发调试 | 端口 3099，tsx 热重载 |
| **HTTP SSE**（生产） | `npm run start:http` | 独立 HTTP 服务 | 端口 3099，适合需要独立服务进程的场景 |

## 验证安装

### 健康检查（HTTP 模式）

```bash
curl http://localhost:3099/health
```

正常返回：

```json
{"status":"ok","version":"2.13.3","tools":73,"domains":{"user":3,"search":3,"group":3,"doc":15,"toc":3,"repo":8,"statistic":4,"note":4,"recycle":3,"upload":1,"board":3,"rss":3,"crawler":4,"mine":4,"kv":4,"web_doc":8}}
```

### 工具列表验证

服务启动后可通过 MCP Client 的 `list_tools` 或 `tools/list` 接口查看全部 73 个工具。

## 集成到 MCP Client

### OpenClaw

在 `config.json` 的 `plugins.entries.mcp` 中添加：

```json
{
  "yuque": {
    "transport": "stdio",
    "command": "node",
    "args": ["/path/to/yuque-ai-mcp/server/dist/index.js"],
    "cwd": "/path/to/yuque-ai-mcp/server"
  }
}
```

或使用 HTTP 模式：

```json
{
  "yuque": {
    "transport": "http",
    "url": "http://localhost:3099/sse"
  }
}
```

### Claude Desktop

在 Claude Desktop 的 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "yuque": {
      "command": "node",
      "args": ["/path/to/yuque-ai-mcp/server/dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp/server"
    }
  }
}
```

### Cursor

在 Cursor 的 MCP 配置中添加上述同样的 stdio 配置。

## 配置参考

### 完整配置项

| 配置 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `token` | string | ✅ | 语雀 API Token |
| `api_base` | string | ❌ | API 基地址，默认 `https://www.yuque.com/api/v2` |
| `cookie` | string | ❌ | 浏览器 Cookie 字符串（回收站/上传/web_doc/mine 需要） |
| `ctoken` | string | ❌ | 从 Cookie 中提取的 `yuque_ctoken` 值 |
| `toc_cache_ttl_minutes` | number | ❌ | TOC 缓存 TTL，默认 60 |
| `rss.enabled` | boolean | ❌ | 是否启用 RSS 抓取，默认 false |
| `kv.enabled` | boolean | ❌ | 是否启用 KV 存储，默认 false |
| `crawler.enabled` | boolean | ❌ | 是否启用爬虫，默认 false |

### RSS 配置结构

```json
{
  "rss": {
    "enabled": true,
    "sources": {
      "cnblogs": {
        "name": "博客园",
        "description": "开发者的网上家园",
        "slug_pattern": "/p/(\\d+)",
        "feeds": {
          "sitehome": { "label": "首页最新", "url": "https://feed.cnblogs.com/blog/sitehome/rss" },
          "user": {
            "label": "用户博客",
            "url_template": "https://feed.cnblogs.com/blog/u/{username}/rss",
            "params_schema": { "username": { "type": "string", "description": "博客园用户名", "required": true } }
          }
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
  }
}
```

| 字段 | 说明 |
|------|------|
| `book_id` | 目标知识库 ID 数组，最后一个为当前活跃仓库。满 5000 篇自动扩容追加 |
| `kv_slugs` | KV 去重分片文档（`{book_id}/{doc_id}` 格式） |
| `schedule_slugs` | 定时策略配置文档 |
| `slug_pattern` | 从 URL 中提取站点文章 ID 的正则 |

### KV 配置

```json
{
  "kv": { "enabled": true }
}
```

启用后可通过语雀文档作为 KV 存储后端（JSON map），适用于 RSS 去重、爬虫去重、通用配置存储。

### Crawler 配置

```json
{
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

## 常见问题

**Q: 启动后报错 `Error: Cannot find module`**  
A: 确认 `npm run build` 编译成功，`server/dist/` 目录存在。

**Q: `get-tool` 调用返回 401**  
A: Token 无效或权限不足。检查 `config.json` 的 `token` 字段，确保 Token 在语雀设置中是有效状态。

**Q: 回收站/上传工具调用失败**  
A: 这些功能需要 Cookie 认证。确保 `config.json` 中配置了 `cookie` 和 `ctoken` 字段。

## 配套 Skill 层

同步维护 [yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills)，提供每个工具的 usage 指导。安装后配合使用效果更佳。