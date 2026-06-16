/**
 * yuque-ai-mcp — 语雀 MCP Server 入口（stdio transport）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./common/register-tools.js";

async function main() {
  const server = new McpServer({
    name: "yuque-ai-mcp",
    version: "2.4.0",
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("yuque-ai-mcp v2.3.0 已启动");
}

main().catch((err) => {
  console.error("启动失败 / Startup failed:", err);
  process.exit(1);
});
