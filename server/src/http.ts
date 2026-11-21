/**
 * yuque-ai-mcp — HTTP MCP Server 入口（SSE transport）
 *
 * 独立 HTTP 进程，通过 mcporter HTTP/SSE 连接，不依赖 Gateway。
 * 默认端口 3099，可通过 PORT 环境变量修改。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "http";
import { timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { registerAllTools, ALL_TOOLS, DOMAIN_COUNTS } from "./common/register-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
const VERSION = pkg.version;

function createMcpServer() {
  const server = new McpServer({ name: "yuque-ai-mcp", version: VERSION });
  registerAllTools(server);
  return server;
}

const PORT = parseInt(process.env.PORT || "3099", 10);

// 默认只监听回环地址：本进程会把用户自己的语雀 token 交给任意连上来的客户端，
// 原实现 httpServer.listen(PORT) 等价于绑定 0.0.0.0，局域网内任何人都能直接调用 65 个工具并读写用户语雀。
const HOST = process.env.HOST || "127.0.0.1";

// 访问令牌：SSE/HTTP 传输本身没有鉴权，必须由环境变量提供共享密钥，缺失时拒绝启动（fail-closed）。
const AUTH_TOKEN = process.env.YUQUE_MCP_HTTP_TOKEN || "";
if (!AUTH_TOKEN) {
  console.error("yuque-ai-mcp HTTP 模式需要访问令牌：请设置环境变量 YUQUE_MCP_HTTP_TOKEN=<随机字符串> 后重试。");
  console.error("生成示例：node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\"");
  process.exit(1);
}

// 允许的浏览器跨域来源：默认一个都不允许（原实现恒回 Access-Control-Allow-Origin: *）。
const ALLOWED_ORIGINS = (process.env.YUQUE_MCP_CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** 校验共享密钥：支持 Authorization: Bearer <token>，以及 ?token=<token>（EventSource 无法自定义请求头） */
function isAuthorized(req: import("http").IncomingMessage, url: URL): boolean {
  const header = req.headers["authorization"];
  const bearer = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const given = bearer || url.searchParams.get("token") || "";
  if (!given || given.length !== AUTH_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(AUTH_TOKEN));
}

// Session 管理：sessionId → transport
const transports = new Map<string, SSEServerTransport>();

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // CORS：只对显式配置的来源回显，其余不返回任何 ACAO 头
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

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
      version: VERSION,
      tools: ALL_TOOLS.length,
      domains: DOMAIN_COUNTS,
    }));
    return;
  }

  // 除 /health 外的所有端点都要求携带共享密钥
  if (!isAuthorized(req, url)) {
    res.writeHead(401, { "WWW-Authenticate": "Bearer" });
    res.end("Unauthorized");
    return;
  }

  // SSE: GET /sse → 建立 SSE 长连接
  if (req.method === "GET" && url.pathname === "/sse") {
    // 把共享密钥编进 endpoint：EventSource 建连时只能带 query（?token=），
    // 而客户端后续 POST /message 是按这条 endpoint 的 URL 原样发（不会继承 /sse 的 query），
    // 若 endpoint 里没有 token，握手能过、每条消息都 401。SDK 会再追加 &sessionId=xxx。
    const transport = new SSEServerTransport(
      `/message?token=${encodeURIComponent(AUTH_TOKEN)}`,
      res,
    );
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

const server = httpServer.listen(PORT, HOST, () => {
  console.error(`yuque-ai-mcp HTTP Server 已启动: http://${HOST}:${PORT}`);
  console.error(`  SSE: GET http://${HOST}:${PORT}/sse?token=<YUQUE_MCP_HTTP_TOKEN>`);
  console.error(`  Message: POST http://${HOST}:${PORT}/message?token=<YUQUE_MCP_HTTP_TOKEN>&sessionId=xxx`);
  console.error(`  Health: GET http://${HOST}:${PORT}/health`);
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

// 未捕获异常兜底：请求处理里有 await（connect / handlePostMessage），
// Node 15+ 对 unhandledRejection 默认直接杀进程，长跑服务会静默消失且不留线索。
process.on("unhandledRejection", (reason) => {
  console.error("未处理的 Promise 拒绝:", reason);
  void gracefulShutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  console.error("未捕获异常:", err);
  void gracefulShutdown("uncaughtException");
});
