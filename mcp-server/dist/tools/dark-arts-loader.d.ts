import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare function loadDarkArts(): Promise<{
    tools: Tool[];
    handlers: Record<string, (args: any) => Promise<string>>;
}>;
