/**
 * 工具注册中心 — 所有工具的 import + 数组 + 注册逻辑
 *
 * 这是工具列表的唯一真实来源。index.ts 和 http.ts 都从这里引用，
 * 新增工具只需改这一个文件。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpTool } from "./types.js";

// ── user ──
import { userGet } from "../user/user.js";
import { helloCheck } from "../user/hello.js";
import { userGroups } from "../user/groups.js";

// ── search ──
import { search } from "../search/search.js";
import { hydeSearch } from "../search/hyde-search.js";

// ── group ──
import { groupListUsers } from "../group/list-users.js";
import { groupUpdateUser } from "../group/update-user.js";
import { groupDeleteUser } from "../group/delete-user.js";

// ── doc ──
import { docList } from "../doc/list-docs.js";
import { docCreate } from "../doc/create-doc.js";
import { docGet } from "../doc/get-doc.js";
import { docUpdate } from "../doc/update-doc.js";
import { docDelete } from "../doc/delete-doc.js";
import { docVersions } from "../doc/versions.js";
import { docVersionDetail } from "../doc/version-detail.js";

// ── toc ──
import { tocGet } from "../toc/get-toc.js";
import { tocUpdate } from "../toc/update-toc.js";

// ── repo ──
import { repoList } from "../repo/list-repos.js";
import { repoCreate } from "../repo/create-repo.js";
import { repoGet } from "../repo/get-repo.js";
import { repoUpdate } from "../repo/update-repo.js";
import { repoDelete } from "../repo/delete-repo.js";

// ── statistic ──
import { groupStatistics } from "../statistic/group-statistics.js";
import { memberStatistics } from "../statistic/member-statistics.js";
import { bookStatistics } from "../statistic/book-statistics.js";
import { docStatistics } from "../statistic/doc-statistics.js";

// ── note ──
import { noteList } from "../note/list-notes.js";
import { noteGet } from "../note/get-note.js";
import { noteCreate } from "../note/create-note.js";
import { noteUpdate } from "../note/update-note.js";

// ── recycle ──
import { recycleList } from "../recycle/list-recycles.js";
import { recycleRestore } from "../recycle/restore-recycle.js";
import { recycleDestroy } from "../recycle/destroy-recycle.js";

// ── upload ──
import { uploadAttachment } from "../upload/attachment.js";

/** 所有工具（按域分组，唯一真实来源） */
export const ALL_TOOLS: McpTool[] = [
  // user
  userGet, helloCheck, userGroups,
  // search
  search, hydeSearch,
  // group
  groupListUsers, groupUpdateUser, groupDeleteUser,
  // doc
  docList, docCreate, docGet, docUpdate, docDelete, docVersions, docVersionDetail,
  // toc
  tocGet, tocUpdate,
  // repo
  repoList, repoCreate, repoGet, repoUpdate, repoDelete,
  // statistic
  groupStatistics, memberStatistics, bookStatistics, docStatistics,
  // note
  noteList, noteGet, noteCreate, noteUpdate,
  // recycle
  recycleList, recycleRestore, recycleDestroy,
  // upload
  uploadAttachment,
];

/** 将 JSON Schema 转为 Zod raw shape 并注册到 McpServer */
export function registerAllTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
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
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: shape,
      }, tool.handler as any);
    } else {
      server.registerTool(tool.name, { description: tool.description }, tool.handler as any);
    }
  }
}
