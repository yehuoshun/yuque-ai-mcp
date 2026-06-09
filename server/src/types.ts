/** 公共类型定义 — 所有工具模块共享 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler(args?: Record<string, unknown>): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}