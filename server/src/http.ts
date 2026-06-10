/**
 * yuque-ai-mcp — HTTP MCP Server 入口（SSE transport）
 *
 * 独立 HTTP 进程，通过 mcporter HTTP/SSE 连接，不依赖 Gateway。
 * 默认端口 3099，可通过 PORT 环境变量修改。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
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
import { docUpdate } from "./doc/update-doc.js";
import { docDelete } from "./doc/delete-doc.js";
import { docVersions } from "./doc/versions.js";
import { docVersionDetail } from "./doc/version-detail.js";
import { tocGet } from "./toc/get-toc.js";
import { tocUpdate } from "./toc/update-toc.js";
import { repoList } from "./repo/list-repos.js";
import { repoCreate } from "./repo/create-repo.js";
import { repoGet } from "./repo/get-repo.js";
import { repoUpdate } from "./repo/update-repo.js";
import { repoDelete } from "./repo/delete-repo.js";
import { groupStatistics } from "./statistic/group-statistics.js";
import { memberStatistics } from "./statistic/member-statistics.js";
import { bookStatistics } from "./statistic/book-statistics.js";
import { docStatistics } from "./statistic/doc-statistics.js";
import { noteList } from "./note/list-notes.js";
import { noteGet } from "./note/get-note.js";
import { noteCreate } from "./note/create-note.js";
import { noteUpdate } from "./note/update-note.js";
import { recycleList } from "./recycle/list-recycles.js";
import { recycleRestore } from "./recycle/restore-recycle.js";
import { recycleDestroy } from "./recycle/destroy-recycle.js";
import { uploadAttachment } from "./upload/attachment.js";

const tools = [
  userGet, helloCheck, userGroups, search,
  groupListUsers, groupUpdateUser, groupDeleteUser,
  docList, docCreate, docGet, docUpdate, docDelete, docVersions, docVersionDetail,
  tocGet, tocUpdate,
  repoList, repoCreate, repoGet, repoUpdate, repoDelete,
  groupStatistics, memberStatistics, bookStatistics, docStatistics,
  noteList, noteGet, noteCreate, noteUpdate,
  recycleList, recycleRestore, recycleDestroy,
  uploadAttachment,
];

function createMcpServer() {
  const server = new McpServer({ name: "yuque-ai-mcp", version: "2.0.0" });
  for (const tool of tools) {
    if (tool.inputSchema) {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        const p = prop as { type: string; description?: string };
        let zodType: z.ZodTypeAny;
        switch (p.type) {
          case "string": zodType = z.string(); break;
          case "number": zodType = z.number(); break;
          case "boolean": zodType = z.boolean(); break;
          default: zodType = z.string();
        }
        if (p.description) zodType = zodType.describe(p.description);
        if (!tool.inputSchema.required?.includes(key)) zodType = zodType.optional();
        shape[key] = zodType;
      }
      server.registerTool(tool.name, { description: tool.description, inputSchema: shape }, tool.handler as any);
    } else {
      server.registerTool(tool.name, { description: tool.description }, tool.handler as any);
    }
  }
  return server;
}

const mcpServer = createMcpServer();
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
    res.end(JSON.stringify({ status: "ok", version: "2.0.0", tools: tools.length }));
    return;
  }

  // SSE: GET /sse → 建立 SSE 长连接
  if (req.method === "GET" && url.pathname === "/sse") {
    const transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);
    res.on("close", () => transports.delete(transport.sessionId));
    await mcpServer.connect(transport);
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

httpServer.listen(PORT, () => {
  console.error(`yuque-ai-mcp HTTP Server 已启动: http://localhost:${PORT}`);
  console.error(`  SSE: GET http://localhost:${PORT}/sse`);
  console.error(`  Message: POST http://localhost:${PORT}/message?sessionId=xxx`);
  console.error(`  Health: GET http://localhost:${PORT}/health`);
});