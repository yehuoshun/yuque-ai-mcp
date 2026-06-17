/**
 * yuque-ai-mcp — 语雀 MCP Server 入口（stdio transport）
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { registerAllTools } from "./common/register-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
const VERSION = pkg.version;

async function main() {
  const server = new McpServer({
    name: "yuque-ai-mcp",
    version: VERSION,
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`yuque-ai-mcp v${VERSION} 已启动`);
}

main().catch((err) => {
  console.error("启动失败 / Startup failed:", err);
  process.exit(1);
});
