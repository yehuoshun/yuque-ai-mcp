/**
 * yuque-ai-mcp — 语雀 MCP Server 入口
 *
 * 细粒度模块化：base/ repo/ doc/ search/ kb/ note/ export/ import/ recycle/ group/ user/ statistic/ upload/ config/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { userGet } from "./base/user.js";
import { helloCheck } from "./base/hello.js";
import { userGroups } from "./base/groups.js";

const tools = [userGet, helloCheck, userGroups];

async function main() {
  const server = new McpServer({
    name: "yuque-ai-mcp",
    version: "2.0.0",
  });

  for (const tool of tools) {
    if (tool.inputSchema) {
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
      }, tool.handler as any);
    } else {
      server.registerTool(tool.name, { description: tool.description }, tool.handler as any);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("yuque-ai-mcp v2.0.0 已启动");
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});