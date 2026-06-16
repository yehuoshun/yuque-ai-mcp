# AGENT-INSTALL.md — yuque-ai-mcp 安装指南

## 概述

yuque-ai-mcp 是一个基于 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 的语雀全功能 MCP Server。

当前版本：**v2.1.0** | 工具数：**49** | 域：**12**

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
  "cookie": "可选，回收站/上传功能需要",
  "ctoken": "可选，从 Cookie 中提取"
}
```

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

# HTTP SSE 模式（开发，端口 3099）
npm run dev:http
```

#### 两种启动模式的区别

| 模式 | 命令 | 场景 | 说明 |
|------|------|------|------|
| **stdio** | `npm start` / `npm run dev` | MCP Client 通过子进程启动 | 标准 MCP 协议，适合 Claude Desktop、Cursor、OpenClaw 等 |
| **HTTP SSE** | `npm run dev:http` | 独立 HTTP 服务 | 端口 3099，通过 SSE endpoint 连接，适合需要独立服务进程的场景 |

## 验证安装

### 健康检查（HTTP 模式）

```bash
curl http://localhost:3099/health
```

正常返回：

```json
{"status":"ok","version":"2.1.0","tools":49,"domains":{"user":3,"search":2,"group":3,"doc":14,"toc":2,"repo":8,"statistic":4,"note":4,"recycle":3,"upload":1,"board":3,"rss":2}}
```

### 工具列表验证

服务启动后可通过 MCP Client 的 `list_tools` 或 `tools/list` 接口查看全部 49 个工具。

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

```json
{
  "token": "语雀 API Token（必填）",
  "api_base": "API 基地址（默认 https://www.yuque.com/api/v2）",
  "cookie": "浏览器 Cookie 字符串（回收站/上传需要）",
  "ctoken": "CSRF Token（回收站/上传需要）",
  "rss": {
    "enabled": true,
    "default_repo": { "book_id": "...", "namespace": "..." },
    "sources": {
      "cnblogs": { "book_id": "...", "namespace": "..." }
    }
  },
  "kv": {
    "enabled": false,
    "default_repo": { "book_id": "...", "namespace": "..." }
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