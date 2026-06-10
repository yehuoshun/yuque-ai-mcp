/**
 * yuque-ai-mcp — 语雀 MCP Server 入口
 *
 * 细粒度模块化：base/ repo/ doc/ search/ kb/ note/ export/ import/ recycle/ group/ user/ statistic/ upload/ config/
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

const tools = [userGet, helloCheck, userGroups, search, groupListUsers, groupUpdateUser, groupDeleteUser, docList, docCreate, docGet, docUpdate, docDelete, docVersions, docVersionDetail, tocGet, tocUpdate, repoList, repoCreate, repoGet, repoUpdate, repoDelete, groupStatistics, memberStatistics, bookStatistics, docStatistics, noteList, noteGet, noteCreate, noteUpdate, recycleList, recycleRestore, recycleDestroy, uploadAttachment];

async function main() {
  const server = new McpServer({
    name: "yuque-ai-mcp",
    version: "2.0.0",
  });

  for (const tool of tools) {
    if (tool.inputSchema) {
      // 将 JSON Schema 格式转为 Zod raw shape
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
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: shape,
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