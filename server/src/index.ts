/**
 * yuque-ai-mcp — 语雀 MCP Server 入口
 *
 * 细粒度模块化：base/ repo/ doc/ search/ kb/ note/ export/ import/ recycle/ group/ user/ statistic/ upload/ config/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { userGet } from "./user/user.js";
import { helloCheck } from "./user/hello.js";
import { userGroups } from "./user/groups.js";
import { search } from "./search/search.js";
import { groupListUsers } from "./group/list-users.js";
import { groupUpdateUser } from "./group/update-user.js";
import { groupDeleteUser } from "./group/delete-user.js";
import { docList } from "./doc/list-docs.js";
import { docCreate } from "./doc/create-doc.js";
import { docGet } from "./doc/get-doc.js";

const tools = [userGet, helloCheck, userGroups, search, groupListUsers, groupUpdateUser, groupDeleteUser, docList, docCreate, docGet];

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