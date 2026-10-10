/**
 * 工具注册中心 — 所有工具的 import + 数组 + 注册逻辑
 *
 * 这是工具列表的唯一真实来源。index.ts 和 http.ts 都从这里引用。
 * 新增工具：在对应域的 index.ts 加 export + 数组，此处自动包含。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { userTools } from "../user/index.js";
import { searchTools } from "../search/index.js";
import { groupTools } from "../group/index.js";
import { docTools } from "../doc/index.js";
import { tocTools } from "../toc/index.js";
import { repoTools } from "../repo/index.js";
import { statisticTools } from "../statistic/index.js";
import { noteTools } from "../note/index.js";
import { recycleTools } from "../recycle/index.js";
import { uploadTools } from "../upload/index.js";
import { boardTools } from "../board/index.js";
import { mineTools } from "../mine/index.js";
import { webDocTools } from "../web-doc/index.js";

/** 所有工具（按域展开，唯一真实来源） */
export const ALL_TOOLS = [
  ...userTools,
  ...searchTools,
  ...groupTools,
  ...docTools,
  ...tocTools,
  ...repoTools,
  ...statisticTools,
  ...noteTools,
  ...recycleTools,
  ...uploadTools,
  ...boardTools,
  ...mineTools,
  ...webDocTools,
];

/** 按域统计工具数 */
export const DOMAIN_COUNTS = {
  user: userTools.length,
  search: searchTools.length,
  group: groupTools.length,
  doc: docTools.length,
  toc: tocTools.length,
  repo: repoTools.length,
  statistic: statisticTools.length,
  note: noteTools.length,
  recycle: recycleTools.length,
  upload: uploadTools.length,
  board: boardTools.length,
  mine: mineTools.length,
  web_doc: webDocTools.length,
};

/** 将 JSON Schema 转为 Zod raw shape 并注册到 McpServer */
export function registerAllTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    if (tool.inputSchema) {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        const p = prop as { type: string; description?: string; items?: { type: string }; oneOf?: Array<{ type: string; items?: { type: string } }>; anyOf?: Array<{ type: string; items?: { type: string } }> };
        let zodType: z.ZodTypeAny;
        switch (p.type) {
          case "string": zodType = z.string(); break;
          case "number": zodType = z.number(); break;
          case "boolean": zodType = z.boolean(); break;
          case "array": {
            const itemType = p.items?.type ?? "string";
            const itemZod = itemType === "number" ? z.number() : itemType === "boolean" ? z.boolean() : z.string();
            zodType = z.array(itemZod);
            break;
          }
          default: {
            // oneOf/anyOf 多形态（如 ops 支持数组或 JSON 字符串）：映射为 union，不再降级 string
            const variants = Array.isArray(p.oneOf) && p.oneOf.length > 0
              ? p.oneOf
              : (Array.isArray(p.anyOf) && p.anyOf.length > 0 ? p.anyOf : null);
            if (variants) {
              zodType = z.union(variants.map((v) => {
                switch (v.type) {
                  case "string": return z.string();
                  case "number": return z.number();
                  case "boolean": return z.boolean();
                  case "array": {
                    // 对象数组（op 结构不固定，用 z.any() 避免元素级降级拦截）
                    return z.array(z.any());
                  }
                  default: return z.string();
                }
              }));
            } else {
              zodType = z.string();
            }
            break;
          }
        }
        if (p.description) zodType = zodType.describe(p.description);
        if (!tool.inputSchema.required?.includes(key)) zodType = zodType.optional();
        shape[key] = zodType;
      }
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: shape,
      }, tool.handler as any);
    } else {
      server.registerTool(tool.name, { description: tool.description }, tool.handler as any);
    }
  }
}