# AGENT-INSTALL.md — 客户端集成指南

yuque-ai-mcp 支持所有兼容 MCP 协议的 AI 客户端。以下为各平台配置方法。

## 前置准备

1. 获取语雀 API Token：https://www.yuque.com/settings/tokens
2. Clone 仓库并安装依赖：

```bash
git clone https://github.com/yehuoshun/yuque-ai-mcp.git
cd yuque-ai-mcp/server
npm install
npm run build
```

3. 配置 Token：

```bash
cp ../config/config.example.json ../config/config.json
# 编辑 ../config/config.json，填入 token
```

> **路径说明**：config.json 位于仓库根目录的 `config/` 下，server 启动时会自动向上两级查找。各客户端配置的 `cwd`（工作目录）必须指向 `server/` 目录。

---

## Claude Desktop

编辑 Claude Desktop 配置文件：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "yuque": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp/server"
    }
  }
}
```

---

## Cursor

编辑 Cursor 的 MCP 配置（`~/.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "yuque": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp/server"
    }
  }
}
```

---

## Windsurf

编辑 Windsurf MCP 配置（`~/.codeium/windsurf/mcp.json`）：

```json
{
  "mcpServers": {
    "yuque": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp/server"
    }
  }
}
```

---

## OpenClaw（Control UI / Gateway）

在 OpenClaw 配置中添加 MCP Server：

```json
{
  "plugins": {
    "entries": {
      "mcp": {
        "servers": {
          "yuque": {
            "command": "node",
            "args": ["dist/index.js"],
            "cwd": "/path/to/yuque-ai-mcp/server"
          }
        }
      }
    }
  }
}
```

或通过 mcporter 管理：

```bash
npx mcporter add yuque -- node dist/index.js --cwd /path/to/yuque-ai-mcp/server
```

---

## Codex（OpenAI）

Codex 通过 ACP 协议接入 MCP Server。在 Codex 配置中添加：

```json
{
  "mcp_servers": {
    "yuque": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/yuque-ai-mcp/server"
    }
  }
}
```

---

## 验证安装

配置完成后重启客户端，在对话中输入：

> 帮我查一下我的语雀用户信息

如果返回你的用户详情（login、name、avatar_url 等），说明配置成功。

---

## 常见问题

### 报错 "config.json 未找到" 或 "请填入有效的 Token"

确保已完成前置步骤：
1. `cp ../config/config.example.json ../config/config.json`
2. 编辑 `../config/config.json` 填入真实 Token
3. config.json 位于仓库根目录的 `config/` 下，server 启动时自动查找

### Token 无效

确认 config.json 中的 token 不为空且不是示例值。重新生成 Token：https://www.yuque.com/settings/tokens

### 回收站/上传功能不可用

这两个功能需要 Cookie 登录态。在 config.json 中补充 `cookie` 和 `ctoken` 字段：

```json
{
  "token": "你的 Token",
  "cookie": "浏览器 F12 → Application → Cookies → 复制完整 Cookie 字符串",
  "ctoken": "从 Cookie 中提取 yuque_ctoken 的值"
}
```

---

## 配套资源

- **Skill 层**：[yuque-ai-skills](https://github.com/yehuoshun/yuque-ai-skills) — 38 个工具使用指导、场景模式、最佳实践
- **API 参考**：[SKILL.md](https://github.com/yehuoshun/yuque-ai-skills/blob/main/SKILL.md) — 完整端点索引和错误码
