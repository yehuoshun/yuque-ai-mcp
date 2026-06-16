/**
 * yuque-ai-mcp — HTTP MCP Server 入口（SSE transport）
 *
 * 独立 HTTP 进程，通过 mcporter HTTP/SSE 连接，不依赖 Gateway。
 * 默认端口 3099，可通过 PORT 环境变量修改。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "http";
import { registerAllTools, ALL_TOOLS, DOMAIN_COUNTS } from "./common/register-tools.js";

function createMcpServer() {
  const server = new McpServer({ name: "yuque-ai-mcp", version: "2.2.0" });
  registerAllTools(server);
  return server;
}

const PORT = parseInt(process.env.PORT || "3099", 10);

// Session 管理：sessionId → transport
const transports = new Map<string, SSEServerTransport>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      version: "2.2.0",
      tools: ALL_TOOLS.length,
      domains: DOMAIN_COUNTS,
    }));
    return;
  }

  // SSE: GET /sse → 建立 SSE 长连接
  if (req.method === "GET" && url.pathname === "/sse") {
    const transport = new SSEServerTransport("/message", res);
    const sessionServer = createMcpServer();
    transports.set(transport.sessionId, transport);
    res.on("close", () => transports.delete(transport.sessionId));
    await sessionServer.connect(transport);
    return;
  }

  // Message: POST /message?sessionId=xxx
  if (req.method === "POST" && url.pathname === "/message") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400);
      res.end("Missing sessionId");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const server = httpServer.listen(PORT, () => {
  console.error(`yuque-ai-mcp HTTP Server 已启动: http://localhost:${PORT}`);
  console.error(`  SSE: GET http://localhost:${PORT}/sse`);
  console.error(`  Message: POST http://localhost:${PORT}/message?sessionId=xxx`);
  console.error(`  Health: GET http://localhost:${PORT}/health`);
});

// ─── 优雅关闭 ────────────────────────────────────────────
let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`\n收到 ${signal}，正在优雅关闭...`);

  // 关闭所有活跃 SSE 连接
  for (const [sessionId, transport] of transports) {
    try {
      console.error(`  关闭 session: ${sessionId}`);
      // SSEServerTransport.close() 在运行时存在但类型声明可能不完整
      (transport as unknown as { close: () => Promise<void> }).close();
    } catch {
      // transport 可能已经关闭
    }
  }
  transports.clear();

  // 停止接受新连接
  server.close(() => {
    console.error("HTTP Server 已关闭");
    process.exit(0);
  });

  // 5 秒强制退出
  setTimeout(() => {
    console.error("强制退出");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
