declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  import { Server } from "@modelcontextprotocol/sdk/server/index.js";
  import { z } from "zod/v4";

  interface McpServerOptions {
    capabilities?: Record<string, unknown>;
  }

  interface ToolRegistration {
    description: string;
    inputSchema?: Record<string, unknown>;
  }

  export class McpServer {
    constructor(info: { name: string; version: string }, options?: McpServerOptions);
    server: Server;
    connect(transport: unknown): Promise<void>;
    registerTool(
      name: string,
      config: ToolRegistration,
      handler: (args: Record<string, unknown>) => Promise<{
        content: Array<{ type: "text"; text: string }>;
        isError?: boolean;
      }>
    ): void;
  }
}

declare module "@modelcontextprotocol/sdk/server/stdio.js" {
  export class StdioServerTransport {
    constructor();
  }
}
