# yuque-mcp-server

语雀 MCP Server — 通过 MCP 协议管理语雀知识库、文档、小记。

## 安装

```bash
npx yuque-mcp-server
```

或在 Claude Desktop / OpenClaw 等 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "yuque-mcp": {
      "command": "npx",
      "args": ["yuque-mcp-server"]
    }
  }
}
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `YUQUE_TOKEN` | 语雀 API Token（必填） |
| `YUQUE_GROUP` | 用户名/团队名 |
| `YUQUE_DEFAULT_BOOK_ID` | 默认知识库 ID |
| `YUQUE_INDEX_BOOK_ID` | 索引知识库 ID |
| `YUQUE_CONFIG_PATH` | 配置文件路径（可选，优先读环境变量） |

## Tools (34)

详见 [`references/api_reference.md`](references/api_reference.md)

- 知识库 CRUD ×5
- 文档 CRUD ×5 + 版本 ×2
- 目录 TOC ×3
- 小记 ×6
- 搜索 ×1
- 批量获取 ×1
- 导入/上传 ×2
- 用户/健康 ×2
- 群组 ×3
- 统计 ×4
