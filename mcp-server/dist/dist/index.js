#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { YuqueAPIError } from "./shared/types.js";
// ---- tools ----
import { listRepos, getRepo, createRepo, updateRepo, deleteRepo } from "./tools/repos.js";
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc, listToc, updateToc, removeTocNode, listDocVersions, getDocVersion } from "./tools/docs.js";
import { listNotes, getNote, createNote, updateNote, deleteNote, restoreNote } from "./tools/notes.js";
import { search } from "./tools/search.js";
import { exportDoc, listDocsForExport } from "./tools/export.js";
import { healthCheck, getUser } from "./tools/user.js";
import { listGroupUsers, updateGroupUser, removeGroupUser } from "./tools/groups.js";
import { getGroupStats, getMemberStats, getBookStats, getDocStats } from "./tools/statistic.js";
// ---- tool definitions ----
const tools = [
    // --- 知识库 ---
    {
        name: "yuque_list_repos",
        description: "列出当前用户的所有语雀知识库",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "yuque_get_repo",
        description: "获取语雀知识库详情",
        inputSchema: {
            type: "object",
            properties: { id_or_namespace: { type: "string", description: "知识库 ID 或 namespace（如 yehuoshun/xxx）" } },
            required: ["id_or_namespace"],
        },
    },
    {
        name: "yuque_create_repo",
        description: "创建新的语雀知识库",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "知识库名称" },
                slug: { type: "string", description: "知识库 slug（可选，自动生成）" },
                description: { type: "string", description: "简介（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私有 1=公开 2=团队内公开" },
            },
            required: ["name"],
        },
    },
    {
        name: "yuque_update_repo",
        description: "更新语雀知识库（名称/描述/可见性等）",
        inputSchema: {
            type: "object",
            properties: {
                id_or_namespace: { type: "string", description: "知识库 ID 或 namespace" },
                name: { type: "string", description: "新名称（可选）" },
                slug: { type: "string", description: "新 slug（可选）" },
                description: { type: "string", description: "新描述（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私有 1=公开 2=团队内公开" },
            },
            required: ["id_or_namespace"],
        },
    },
    {
        name: "yuque_delete_repo",
        description: "⚠️ 硬删除语雀知识库，不可恢复",
        inputSchema: {
            type: "object",
            properties: { id_or_namespace: { type: "string", description: "知识库 ID 或 namespace" } },
            required: ["id_or_namespace"],
        },
    },
    {
        name: "yuque_list_toc",
        description: "列出知识库的目录结构",
        inputSchema: {
            type: "object",
            properties: { book_id: { type: "number", description: "知识库 ID" } },
            required: ["book_id"],
        },
    },
    {
        name: "yuque_update_toc",
        description: "更新知识库目录（挂载/编辑/移除节点）",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                action: { type: "string", enum: ["appendNode", "prependNode", "editNode", "removeNode"], description: "操作类型" },
                action_mode: { type: "string", enum: ["sibling", "child"], description: "sibling=同级 child=子节点" },
                type: { type: "string", enum: ["DOC", "TITLE", "LINK"], description: "节点类型" },
                doc_ids: { type: "array", items: { type: "number" }, description: "文档 ID 列表" },
                target_uuid: { type: "string", description: "目标节点 UUID" },
                title: { type: "string", description: "新标题（editNode 时）" },
            },
            required: ["book_id"],
        },
    },
    {
        name: "yuque_remove_toc_node",
        description: "从目录中移除节点（不删除文档本身）",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                target_uuid: { type: "string", description: "要移除的节点 UUID" },
            },
            required: ["book_id", "target_uuid"],
        },
    },
    // --- 文档 ---
    {
        name: "yuque_list_docs",
        description: "列出知识库内的文档列表",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                offset: { type: "number", description: "分页偏移（默认 0）" },
                limit: { type: "number", description: "每页数量（默认 100）" },
                optional_properties: { type: "string", description: "额外返回字段，逗号分隔：hits(阅读数)/tags(标签)/latest_version_id" },
            },
            required: ["book_id"],
        },
    },
    {
        name: "yuque_get_doc",
        description: "获取语雀文档内容，返回完整 JSON（含 format/body/body_html/body_lake 适配多格式）",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                doc_id: { type: "number", description: "文档 ID" },
            },
            required: ["book_id", "doc_id"],
        },
    },
    {
        name: "yuque_create_doc",
        description: "在知识库中创建文档，自动挂载到目录",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID（默认使用 config 中的 default_book）" },
                title: { type: "string", description: "文档标题" },
                body: { type: "string", description: "文档正文" },
                format: { type: "string", enum: ["markdown", "html", "lake"], description: "内容格式（默认 markdown）" },
                slug: { type: "string", description: "文档路径（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私密 1=公开 2=企业内公开（不填继承知识库）" },
            },
            required: ["title", "body"],
        },
    },
    {
        name: "yuque_update_doc",
        description: "更新语雀文档（标题/正文/路径/格式/公开性）",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                doc_id: { type: "number", description: "文档 ID" },
                title: { type: "string", description: "新标题（可选）" },
                body: { type: "string", description: "新正文（可选）" },
                slug: { type: "string", description: "新路径（可选）" },
                format: { type: "string", enum: ["markdown", "html", "lake"], description: "内容格式（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私密 1=公开 2=企业内公开（可选）" },
            },
            required: ["book_id", "doc_id"],
        },
    },
    {
        name: "yuque_delete_doc",
        description: "⚠️ 硬删除语雀文档，不可恢复",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                doc_id: { type: "number", description: "文档 ID" },
            },
            required: ["book_id", "doc_id"],
        },
    },
    // --- 文档版本 ---
    {
        name: "yuque_list_doc_versions",
        description: "获取文档的版本历史列表",
        inputSchema: {
            type: "object",
            properties: {
                doc_id: { type: "number", description: "文档 ID" },
            },
            required: ["doc_id"],
        },
    },
    {
        name: "yuque_get_doc_version",
        description: "获取文档某版本的内容详情",
        inputSchema: {
            type: "object",
            properties: {
                version_id: { type: "number", description: "版本 ID" },
            },
            required: ["version_id"],
        },
    },
    // --- 小记 ---
    {
        name: "yuque_list_notes",
        description: "列出语雀小记",
        inputSchema: {
            type: "object",
            properties: {
                page: { type: "number", description: "页码（默认 1）" },
                limit: { type: "number", description: "每页数量（默认 20）" },
                status: { type: "number", description: "状态：0=正常 9=已删除（默认 0）" },
            },
            required: [],
        },
    },
    {
        name: "yuque_get_note",
        description: "获取语雀小记详情",
        inputSchema: {
            type: "object",
            properties: { note_id: { type: "number", description: "小记 ID" } },
            required: ["note_id"],
        },
    },
    {
        name: "yuque_create_note",
        description: "创建语雀小记",
        inputSchema: {
            type: "object",
            properties: { body: { type: "string", description: "小记正文" } },
            required: ["body"],
        },
    },
    {
        name: "yuque_update_note",
        description: "更新语雀小记",
        inputSchema: {
            type: "object",
            properties: {
                note_id: { type: "number", description: "小记 ID" },
                body: { type: "string", description: "新正文" },
                title: { type: "string", description: "新标题（可选）" },
            },
            required: ["note_id", "body"],
        },
    },
    {
        name: "yuque_delete_note",
        description: "软删除语雀小记（移入回收站，可恢复）",
        inputSchema: {
            type: "object",
            properties: { note_id: { type: "number", description: "小记 ID" } },
            required: ["note_id"],
        },
    },
    {
        name: "yuque_restore_note",
        description: "恢复已删除的语雀小记",
        inputSchema: {
            type: "object",
            properties: { note_id: { type: "number", description: "小记 ID" } },
            required: ["note_id"],
        },
    },
    // --- 搜索 ---
    {
        name: "yuque_search",
        description: "搜索语雀内容（文档/知识库等）",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "搜索关键词" },
                scope: { type: "string", description: "搜索范围 namespace（可选，不传搜全库）" },
                type: { type: "string", description: "搜索类型：doc/repo 等（默认 doc）" },
                page: { type: "number", description: "页码（默认 1）" },
            },
            required: ["query"],
        },
    },
    // --- 导出 ---
    {
        name: "yuque_export_doc",
        description: "导出单篇语雀文档为 Markdown",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                doc_id: { type: "number", description: "文档 ID" },
            },
            required: ["book_id", "doc_id"],
        },
    },
    {
        name: "yuque_list_docs_for_export",
        description: "列出知识库文档列表（用于批量导出前预览）",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: "number", description: "知识库 ID" },
                offset: { type: "number", description: "分页偏移" },
                limit: { type: "number", description: "每页数量" },
            },
            required: ["book_id"],
        },
    },
    // --- 健康检查 ---
    {
        name: "yuque_health_check",
        description: "检查语雀配置是否正常（Token 有效性、知识库可访问性）",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "yuque_get_user",
        description: "获取当前 Token 的用户详情（login/name/统计等）",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    // --- 群组 ---
    {
        name: "yuque_list_group_users",
        description: "列出群组成员（支持角色筛选和分页）",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                role: { type: "number", enum: [0, 1, 2], description: "0=管理员 1=成员 2=只读（可选筛选）" },
                offset: { type: "number", description: "分页偏移（默认 0，每页 100）" },
            },
            required: ["login"],
        },
    },
    {
        name: "yuque_update_group_user",
        description: "更新群组成员角色",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                id: { type: "string", description: "用户 Login 或 ID" },
                role: { type: "number", enum: [0, 1, 2], description: "0=管理员 1=成员 2=只读" },
            },
            required: ["login", "id", "role"],
        },
    },
    {
        name: "yuque_remove_group_user",
        description: "⚠️ 从群组移除成员",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                id: { type: "string", description: "用户 Login 或 ID" },
            },
            required: ["login", "id"],
        },
    },
    // --- 统计（需 statistic:read 权限）---
    {
        name: "yuque_get_group_stats",
        description: "获取团队整体统计数据（需 statistic:read 权限）",
        inputSchema: {
            type: "object",
            properties: { login: { type: "string", description: "团队 Login 或 ID" } },
            required: ["login"],
        },
    },
    {
        name: "yuque_get_member_stats",
        description: "获取团队成员统计数据（支持筛选/排序/分页）",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                name: { type: "string", description: "成员名筛选（可选）" },
                range: { type: "number", enum: [0, 30, 365], description: "时间范围：0=全部 30=30天 365=一年" },
                page: { type: "number", description: "页码（默认 1）" },
                limit: { type: "number", description: "分页数量（默认 10，最大 20）" },
                sortField: { type: "string", enum: ["write_doc_count", "write_count", "read_count", "like_count"], description: "排序字段" },
                sortOrder: { type: "string", enum: ["desc", "asc"], description: "排序方向（默认 desc）" },
            },
            required: ["login"],
        },
    },
    {
        name: "yuque_get_book_stats",
        description: "获取团队知识库统计数据（支持筛选/排序/分页）",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                name: { type: "string", description: "知识库名筛选（可选）" },
                range: { type: "number", enum: [0, 30, 365], description: "时间范围：0=全部 30=30天 365=一年" },
                page: { type: "number", description: "页码（默认 1）" },
                limit: { type: "number", description: "分页数量（默认 10，最大 20）" },
                sortField: { type: "string", enum: ["content_updated_at_ms", "word_count", "post_count", "read_count", "like_count", "watch_count", "comment_count"], description: "排序字段" },
                sortOrder: { type: "string", enum: ["desc", "asc"], description: "排序方向（默认 desc）" },
            },
            required: ["login"],
        },
    },
    {
        name: "yuque_get_doc_stats",
        description: "获取团队文档统计数据（支持筛选/排序/分页）",
        inputSchema: {
            type: "object",
            properties: {
                login: { type: "string", description: "团队 Login 或 ID" },
                bookId: { type: "number", description: "指定知识库 ID（可选）" },
                name: { type: "string", description: "文档名筛选（可选）" },
                range: { type: "number", enum: [0, 30, 365], description: "时间范围：0=全部 30=30天 365=一年" },
                page: { type: "number", description: "页码（默认 1）" },
                limit: { type: "number", description: "分页数量（默认 10，最大 20）" },
                sortField: { type: "string", enum: ["content_updated_at", "word_count", "read_count", "like_count", "comment_count", "created_at"], description: "排序字段" },
                sortOrder: { type: "string", enum: ["desc", "asc"], description: "排序方向（默认 desc）" },
            },
            required: ["login"],
        },
    },
];
// ---- handler map ----
const handlers = {
    yuque_list_repos: () => listRepos(),
    yuque_get_repo: (a) => getRepo(a),
    yuque_create_repo: (a) => createRepo(a),
    yuque_update_repo: (a) => updateRepo(a),
    yuque_delete_repo: (a) => deleteRepo(a),
    yuque_list_toc: (a) => listToc(a),
    yuque_update_toc: (a) => updateToc(a),
    yuque_remove_toc_node: (a) => removeTocNode(a),
    yuque_list_docs: (a) => listDocs(a),
    yuque_get_doc: (a) => getDoc(a),
    yuque_create_doc: (a) => createDoc(a),
    yuque_update_doc: (a) => updateDoc(a),
    yuque_delete_doc: (a) => deleteDoc(a),
    yuque_list_doc_versions: (a) => listDocVersions(a),
    yuque_get_doc_version: (a) => getDocVersion(a),
    yuque_list_notes: (a) => listNotes(a),
    yuque_get_note: (a) => getNote(a),
    yuque_create_note: (a) => createNote(a),
    yuque_update_note: (a) => updateNote(a),
    yuque_delete_note: (a) => deleteNote(a),
    yuque_restore_note: (a) => restoreNote(a),
    yuque_search: (a) => search(a),
    yuque_export_doc: (a) => exportDoc(a),
    yuque_list_docs_for_export: (a) => listDocsForExport(a),
    yuque_health_check: () => healthCheck(),
    yuque_get_user: () => getUser(),
    yuque_list_group_users: (a) => listGroupUsers(a),
    yuque_update_group_user: (a) => updateGroupUser(a),
    yuque_remove_group_user: (a) => removeGroupUser(a),
    yuque_get_group_stats: (a) => getGroupStats(a),
    yuque_get_member_stats: (a) => getMemberStats(a),
    yuque_get_book_stats: (a) => getBookStats(a),
    yuque_get_doc_stats: (a) => getDocStats(a),
};
// ---- server ----
const server = new Server({ name: "yuque-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
        return {
            content: [{ type: "text", text: `未知工具: ${name}` }],
            isError: true,
        };
    }
    try {
        const result = await handler(args || {});
        return { content: [{ type: "text", text: result }] };
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: error instanceof YuqueAPIError
                        ? `❌ 语雀 API 错误 [${error.statusCode}]: ${error.message}`
                        : `❌ 执行失败: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🦞 yuque-mcp server started");
}
main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map