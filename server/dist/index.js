#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { YuqueAPIError } from "./shared/types.js";
import { loadDarkArts } from "./tools/dark-arts-loader.js";
import { addRouteBook, addRouteBookSub, addGraphBook, loadConfig, reloadConfig } from "./config.js";
// ---- tools ----
import { listRepos, getRepo, createRepo, updateRepo, deleteRepo } from "./tools/repos.js";
import { listBookStacks, createBookStack, updateBookStack, sortBookStacks, moveBooks } from "./tools/book-stacks/index.js";
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc, listToc, updateToc, removeTocNode, listDocVersions, getDocVersion } from "./tools/docs.js";
import { listNotes, getNote, createNote, updateNote, deleteNote, restoreNote } from "./tools/notes.js";
import { search } from "./tools/search.js";
import { batchGetDocsBody } from "./tools/export.js";
import { healthCheck, getUser, getUserStats } from "./tools/user.js";
import { listGroupUsers, updateGroupUser, removeGroupUser } from "./tools/groups.js";
import { getGroupStats, getMemberStats, getBookStats, getDocStats } from "./tools/statistic.js";
import { uploadAttachment } from "./tools/upload.js";
import { importDoc } from "./tools/import.js";
import { kbSearch, createIndexDoc, updateIndexEntries } from "./tools/kb.js";
import { listRecycles, restoreRecycle, destroyRecycle } from "./tools/recycles.js";
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
                slug: { type: "string", description: "知识库 slug（必填，语雀不再自动生成）。生成规则：{英文名}-{时间戳秒}，如 python-course-1714473600" },
                description: { type: "string", description: "简介（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私有 1=公开 2=团队内公开" },
            },
            required: ["name", "slug"],
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
        name: "yuque_list_repo_groups",
        description: "列出知识库分组（仪表盘视图，返回分组结构和每个分组下的知识库列表）。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "yuque_create_book_stack",
        description: "创建知识库分组。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "分组名称" },
                target_rank: { type: "number", description: "排序位置（默认 0，放最前）" },
            },
            required: ["name"],
        },
    },
    {
        name: "yuque_update_book_stack",
        description: "更新知识库分组（改名）。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                stack_id: { type: "number", description: "分组 ID" },
                name: { type: "string", description: "新名称" },
            },
            required: ["stack_id", "name"],
        },
    },
    {
        name: "yuque_sort_book_stacks",
        description: "调整分组排序位置。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                stack_id: { type: "number", description: "分组 ID" },
                target_rank: { type: "number", description: "目标排序位置（0 放最前）" },
            },
            required: ["stack_id"],
        },
    },
    {
        name: "yuque_move_books",
        description: "移动知识库到指定分组。sourceStackId 为 0 表示从「未分组」区域移动。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                targetStackId: { type: "number", description: "目标分组 ID" },
                sourceStackId: { type: "number", description: "源分组 ID（0 = 未分组）" },
                sourceBookIds: { type: "array", items: { type: "number" }, description: "要移动的知识库 ID 列表" },
                targetBookIds: { type: "array", items: { type: "number" }, description: "目标位置前的知识库 ID（可选，影响排序）" },
            },
            required: ["targetStackId", "sourceStackId", "sourceBookIds"],
        },
    },
    {
        name: "yuque_list_toc",
        description: "列出知识库的目录结构",
        inputSchema: {
            type: "object",
            properties: { book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" } },
            required: ["book_id"],
        },
    },
    {
        name: "yuque_update_toc",
        description: "更新知识库目录（创建 TITLE/DOC 分组、移动/编辑/删除节点）。创建根级 TITLE 用 appendNode+sibling+type:TITLE+title+target_uuid；创建子 TITLE 用 appendNode+child+target_uuid；移动 DOC 到分组下需先 removeNode 再 appendNode child+doc_ids+target_uuid；编辑用 editNode+sibling+node_uuid+title；删除用 removeNode+sibling+node_uuid",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
                action: { type: "string", enum: ["appendNode", "prependNode", "editNode", "removeNode"], description: "操作类型" },
                action_mode: { type: "string", enum: ["sibling", "child"], description: "sibling=同级 child=子节点" },
                type: { type: "string", enum: ["DOC", "TITLE", "LINK"], description: "节点类型（创建时必填）" },
                doc_ids: { type: "array", items: { type: "number" }, description: "文档 ID 列表（创建 DOC 时必填）" },
                target_uuid: { type: "string", description: "目标节点 UUID（appendNode/prependNode 时指定位置，创建 TITLE 必填）" },
                node_uuid: { type: "string", description: "操作节点 UUID（移动/编辑/删除时必填，表示要操作的已有 TOC 节点）" },
                title: { type: "string", description: "节点名称（创建 TITLE 或 editNode 改名时必填）" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace。留空使用 config default_book" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
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
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
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
        description: "搜索语雀内容（文档/知识库等），返回 Markdown 文本：分页信息 + 去重结果列表（标题/链接/摘要）",
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
    // --- 上传 ---
    {
        name: "yuque_import_doc",
        description: "导入单个文件到语雀知识库。支持类型：Markdown（自动适配 WikiLinks/callout/frontmatter/注释/标签）、代码/文本（自动识别语言包代码块）、图片（上传 CDN 嵌入）、其他文件（上传为附件引用）。支持预适配 body（Agent 已用 LLM 处理过的内容）",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "本地文件路径（必填，除非提供了 body）" },
                book_id: { type: ["number", "string"], description: "目标知识库 ID 或 namespace。留空使用 config default_book" },
                body: { type: "string", description: "预适配好的正文（可选。提供后跳过文件读取和 regex 适配，仅做图片上传+创建文档）" },
                title: { type: "string", description: "文档标题（可选。不填则从 frontmatter/文件名/H1 提取）" },
                skip_images: { type: "boolean", description: "跳过图片上传（默认 false，无 cookie 时自动跳过）" },
                upload_original: { type: "boolean", description: "上传原始文件作为附件引用（默认 false）" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "yuque_upload_attachment",
        description: "上传文件到语雀 CDN（需 Cookie 登录态。支持 image/attachment/video 三种类型，默认 attachment。上限按类型：图片20MB / 附件500MB / 视频500MB）",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "本地文件路径" },
                type: { type: "string", enum: ["image", "attachment", "video"], description: "文件类型（默认 attachment）" },
                cookie: { type: "string", description: "语雀 Cookie 字符串（可选，默认读 config）" },
                ctoken: { type: "string", description: "CSRF Token（可选，默认读 config）" },
            },
            required: ["file_path"],
        },
    },
    {
        name: "yuque_batch_get_docs_body",
        description: "批量获取多篇文档的 Markdown 正文（并发数由 config.search_concurrency 控制，默认 5。底层走 get_doc。语雀 v2 无 /export 端点，get_doc 的 body 字段即 Markdown 原文）",
        inputSchema: {
            type: "object",
            properties: {
                docs: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace（如 group/book_slug）" },
                            doc_id: { type: "number", description: "文档 ID" },
                        },
                        required: ["book_id", "doc_id"],
                    },
                    description: "文档列表 [{book_id, doc_id}, ...]",
                },
            },
            required: ["docs"],
        },
    },
    {
        name: "yuque_get_user_stats",
        description: "获取个人写作统计仪表盘（知识库/文档/编辑/字数/社交/小记全维度，含总量+30天+365天）。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
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
    // ═══════════ 知识库搜索 & 索引构建 ═══════════
    {
        name: "yuque_kb_search",
        description: "知识库管道搜索（双层路由 + 图谱扩展 + 自动降级）。输入搜索 token 数组，自动完成：1) 总库路由定位 2) 子库索引文档读取 3) 命中<3篇时图谱1跳邻居扩展 4) 路由0命中时自动降级语雀全库搜索。返回结构化 JSON（KbSearchResult），字段：tokens/route_hits/source_entries(含tree)/graph_expanded/graph_neighbors/fallback_used/dirty_blocks/errors/hint。",
        inputSchema: {
            type: "object",
            properties: {
                tokens: { type: "array", items: { type: "string" }, description: "搜索 token 数组（由 Agent LLM 生成，每个 token 独立并行搜）" },
                route_ns: { type: "string", description: "索引总库 namespace（可选，默认读 config YUQUE_ROUTE_BOOK_NS）" },
                route_id: { type: ["number", "string"], description: "索引总库 book_id（可选，默认读 config YUQUE_ROUTE_BOOK_ID）" },
            },
            required: ["tokens"],
        },
    },
    {
        name: "yuque_index_create",
        description: "创建关键词索引文档。一个关键词 = 一篇索引文档，标题为关键词。一对多：一个关键词可指向多篇源文档。body 为 JSON 数组，每项为一个 DocEntry。自动挂 TOC。",
        inputSchema: {
            type: "object",
            properties: {
                keyword: { type: "string", description: "索引关键词（直接用作文档标题，不含符号）" },
                entries: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            doc_id: { type: "number", description: "源文档 ID" },
                            namespace: { type: "string", description: "源知识库 namespace（如 yehuoshun/dil9w3）" },
                            doc_title: { type: "string", description: "源文档标题" },
                            slug: { type: "string", description: "源文档 slug" },
                            url: { type: "string", description: "源文档完整链接（如 https://www.yuque.com/{namespace}/{slug}）" },
                            weight: { type: "number", description: "权重 1-10，LLM 判断该文档与关键词的拟合度" },
                            title: { type: "string", description: "entry 文档标题（可选）" },
                            keywords: { type: "array", items: { type: "string" }, description: "entry 关键词数组（可选，同义词/变体/缩写/口语问法）" },
                            search_surface: { type: "string", description: "entry 搜索面（可选），自然语言问句/口语表达，逗号分隔" },
                            summary: { type: "string", description: "entry 摘要（可选，100-200 字）" },
                            tree: { type: "object", description: "章节树（可选，文档 > 5000 字时），格式 {sections: [{id, title, summary}]}" },
                        },
                        required: ["doc_id", "namespace", "doc_title", "slug", "url", "weight"],
                    },
                    description: "源文档指针列表，一个关键词可对应多篇源文档。每项含 doc_id/namespace/doc_title/slug/url/weight 全部必填，可选 title/keywords/search_surface/summary/tree",
                },
                index_book_id: { type: ["number", "string"], description: "子索引库 book_id" },
                route_book_id: { type: ["number", "string"], description: "总库 book_id（可选，传此参数则创建索引文档后立即自动创建总库路由文档，单文档粒度原子操作）" },
            },
            required: ["keyword", "entries", "index_book_id"],
        },
    },
    {
        name: "yuque_index_update_entries",
        description: "增量更新关键词索引文档的 entries。支持 add（追加）、remove（移除）、update（按 doc_id 合并字段）。自动完成读-改-写-路由同步的原子操作。",
        inputSchema: {
            type: "object",
            properties: {
                keyword: { type: "string", description: "关键词（索引文档标题）" },
                index_book_id: { type: ["number", "string"], description: "子索引库 book_id" },
                route_book_id: { type: ["number", "string"], description: "总库 book_id（可选，传了则自动同步路由）" },
                add: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            doc_id: { type: "number" },
                            namespace: { type: "string" },
                            doc_title: { type: "string" },
                            slug: { type: "string" },
                            url: { type: "string" },
                            weight: { type: "number" },
                            title: { type: "string" },
                            keywords: { type: "array", items: { type: "string" } },
                            search_surface: { type: "string" },
                            summary: { type: "string" },
                            tree: { type: "object" },
                        },
                        required: ["doc_id", "namespace", "doc_title", "slug", "weight"],
                    },
                    description: "要新增的 entries（按 doc_id 去重，已存在则跳过）",
                },
                remove: { type: "array", items: { type: "number" }, description: "要移除的源文档 doc_id 列表" },
                update: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            doc_id: { type: "number" },
                            weight: { type: "number" },
                            title: { type: "string" },
                            keywords: { type: "array", items: { type: "string" } },
                            search_surface: { type: "string" },
                            summary: { type: "string" },
                            tree: { type: "object" },
                        },
                        required: ["doc_id"],
                    },
                    description: "要更新的 entries（按 doc_id 匹配，只更新提供的字段，其他字段保留原值）",
                },
            },
            required: ["keyword", "index_book_id"],
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
    // --- 配置管理 & 状态检查 ---
    {
        name: "yuque_reload_config",
        description: "重新加载 config/yuque-config.json 配置文件（修改配置后无需重启 MCP Server）",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "yuque_config_status",
        description: "检查索引配置状态：总库/子库是否已配、子库容量使用率、缺失或满的 actionable 提示。索引构建前必调此工具做前置检查。",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
    {
        name: "yuque_config_update",
        description: "更新索引配置（追加 route_book/route_book_sub/graph_book 条目，自动持久化到配置文件并重载）。创建新总库/子索引库/图库后调此工具写入配置。",
        inputSchema: {
            type: "object",
            properties: {
                route_book_add: {
                    type: "array",
                    items: { type: "object", properties: { book_id: { type: ["number", "string"] }, namespace: { type: "string" } }, required: ["book_id", "namespace"] },
                    description: "追加到 route_book 的条目",
                },
                route_book_sub_add: {
                    type: "array",
                    items: { type: "object", properties: { book_id: { type: ["number", "string"] }, namespace: { type: "string" } }, required: ["book_id", "namespace"] },
                    description: "追加到 route_book_sub 的条目",
                },
                graph_book: {
                    type: "object",
                    properties: { book_id: { type: ["number", "string"] }, namespace: { type: "string" } },
                    required: ["book_id", "namespace"],
                    description: "设置 graph_book（图谱库），覆盖已有配置",
                },
            },
            required: [],
        },
    },
    {
        name: "yuque_list_recycles",
        description: "列出语雀回收站中的已删除项目（文档/小记/知识库等）。⚠️ 需要 Cookie 登录态，请在 config 中配置 cookie 和 ctoken",
        inputSchema: {
            type: "object",
            properties: {
                offset: { type: "number", description: "分页偏移（默认 0）" },
                limit: { type: "number", description: "每页数量（默认 50，最大 100）" },
                target_type: { type: "string", enum: ["Doc", "Note", "Repo"], description: "筛选目标类型（可选）" },
            },
            required: [],
        },
    },
    {
        name: "yuque_restore_recycle",
        description: "从回收站恢复已删除的项目。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                recycle_id: { type: "number", description: "回收站项目 ID（从 yuque_list_recycles 获取）" },
            },
            required: ["recycle_id"],
        },
    },
    {
        name: "yuque_destroy_recycle",
        description: "⚠️ 彻底删除回收站中的项目，不可恢复。⚠️ 需要 Cookie 登录态",
        inputSchema: {
            type: "object",
            properties: {
                recycle_id: { type: "number", description: "回收站项目 ID（从 yuque_list_recycles 获取）" },
            },
            required: ["recycle_id"],
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
    yuque_list_repo_groups: () => listBookStacks(),
    yuque_create_book_stack: (a) => createBookStack(a),
    yuque_update_book_stack: (a) => updateBookStack(a),
    yuque_sort_book_stacks: (a) => sortBookStacks(a),
    yuque_move_books: (a) => moveBooks(a),
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
    yuque_batch_get_docs_body: (a) => batchGetDocsBody(a),
    yuque_import_doc: (a) => importDoc(a),
    yuque_upload_attachment: (a) => uploadAttachment(a),
    yuque_health_check: () => healthCheck(),
    yuque_get_user: () => getUser(),
    yuque_get_user_stats: () => getUserStats(),
    yuque_list_group_users: (a) => listGroupUsers(a),
    yuque_update_group_user: (a) => updateGroupUser(a),
    yuque_remove_group_user: (a) => removeGroupUser(a),
    // 知识库搜索 & 索引构建
    yuque_kb_search: (a) => kbSearch(a),
    yuque_index_create: (a) => createIndexDoc(a),
    yuque_index_update_entries: (a) => updateIndexEntries(a),
    yuque_get_group_stats: (a) => getGroupStats(a),
    yuque_get_member_stats: (a) => getMemberStats(a),
    yuque_get_book_stats: (a) => getBookStats(a),
    yuque_get_doc_stats: (a) => getDocStats(a),
    yuque_list_recycles: (a) => listRecycles(a),
    yuque_restore_recycle: (a) => restoreRecycle(a),
    yuque_destroy_recycle: (a) => destroyRecycle(a),
    yuque_reload_config: async () => { const c = reloadConfig(); return `✅ 配置已重新加载（${c.route_book.length} 个总库 / ${c.route_book_sub.length} 个子库）`; },
    yuque_config_status: async () => configStatus(),
    yuque_config_update: async (a) => configUpdate(a),
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
// ─── 配置管理 handler ──────────────────────────────────
async function configStatus() {
    const cfg = loadConfig();
    const lines = [];
    lines.push("## 索引总库 (route_book)");
    if (cfg.route_book.length === 0) {
        lines.push("❌ 未配置。需 yuque_config_update 追加，或通知 Agent 创建总库。");
    }
    else {
        for (const b of cfg.route_book) {
            lines.push(`✅ book_id=${b.book_id} ns=${b.namespace}`);
        }
    }
    lines.push("", "## 子索引库 (route_book_sub)");
    if (cfg.route_book_sub.length === 0) {
        lines.push("❌ 未配置。需 yuque_config_update 追加，或通知 Agent 创建子索引库。");
    }
    else {
        for (const b of cfg.route_book_sub) {
            try {
                const { get } = await import("./client.js");
                const data = await get(`/repos/${b.book_id}`);
                const repo = data.data || data;
                const count = repo.items_count || 0;
                const limit = 5000;
                const pct = Math.round((count / limit) * 1000) / 10;
                const icon = count >= limit * 0.97 ? "🛑" : count >= limit * 0.9 ? "⚠️" : "✅";
                lines.push(`${icon} book_id=${b.book_id} ns=${b.namespace} | 文档: ${count}/${limit} (${pct}%) | 名称: ${repo.name || "—"}`);
            }
            catch {
                lines.push(`❓ book_id=${b.book_id} ns=${b.namespace} | 无法获取详情`);
            }
        }
    }
    lines.push("");
    const hasRoute = cfg.route_book.length > 0;
    const hasSub = cfg.route_book_sub.length > 0;
    lines.push("## 并发配置");
    lines.push(`🔧 index_concurrency=${cfg.index_concurrency || 1} | search_concurrency=${cfg.search_concurrency || 5}`);
    lines.push("");
    lines.push("## 图谱库 (graph_book)");
    if (cfg.graph_book?.book_id) {
        try {
            const { get } = await import("./client.js");
            const data = await get(`/repos/${cfg.graph_book.book_id}`);
            const repo = data.data || data;
            lines.push(`✅ book_id=${cfg.graph_book.book_id} ns=${cfg.graph_book.namespace} | 文档: ${repo.items_count || 0} | 名称: ${repo.name || "—"}`);
        }
        catch {
            lines.push(`❓ book_id=${cfg.graph_book.book_id} ns=${cfg.graph_book.namespace} | 无法获取详情`);
        }
    }
    else {
        lines.push("⚠️ 未配置。图谱扩展功能不可用。需 yuque_create_repo 创建图库后写入 config。");
    }
    lines.push("");
    if (hasRoute && hasSub) {
        lines.push("💡 索引配置完整，可直接构建索引。");
    }
    else {
        const missing = [!hasRoute && "总库", !hasSub && "子库"].filter(Boolean).join("/");
        lines.push(`⚠️ 索引配置不完整：缺 ${missing}。构建前需补齐。`);
    }
    return lines.join("\n");
}
async function configUpdate(args) {
    const lines = [];
    let changed = false;
    if (args.route_book_add?.length) {
        for (const b of args.route_book_add) {
            addRouteBook(b);
            lines.push(`✅ 总库追加: book_id=${b.book_id} ns=${b.namespace}`);
        }
        changed = true;
    }
    if (args.route_book_sub_add?.length) {
        for (const b of args.route_book_sub_add) {
            addRouteBookSub(b);
            lines.push(`✅ 子库追加: book_id=${b.book_id} ns=${b.namespace}`);
        }
        changed = true;
    }
    if (args.graph_book) {
        addGraphBook(args.graph_book);
        lines.push(`✅ 图库设置: book_id=${args.graph_book.book_id} ns=${args.graph_book.namespace}`);
        changed = true;
    }
    if (!changed) {
        return "⚠️ 未指定 route_book_add、route_book_sub_add 或 graph_book，无变更。";
    }
    reloadConfig(true);
    return lines.join("\n");
}
async function main() {
    // 🕶️ 动态加载邪修玩法（子模块不存在则跳过）
    const darkArts = await loadDarkArts();
    if (darkArts.tools.length > 0) {
        tools.push(...darkArts.tools);
        Object.assign(handlers, darkArts.handlers);
        console.error(`🕶️ dark-arts: ${darkArts.tools.length} tools 已加载`);
    }
    const args = process.argv.slice(2);
    const httpMode = args.includes("--http") || args.includes("-h");
    if (httpMode) {
        // HTTP 模式：独立进程，网关通过 URL 连接
        const portIdx = args.indexOf("--port");
        const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3456;
        // 用 express 适配 StreamableHTTP（SDK 内置 express helper）
        const express = await import("@modelcontextprotocol/sdk/server/express.js");
        const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
        const { randomUUID } = await import("node:crypto");
        const app = express.createMcpExpressApp();
        // 无状态模式：每次请求创建新的 transport，不维护 session
        app.post("/mcp", async (req, res) => {
            try {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined,
                });
                // 连接到全局 server（含 dark-arts），用完即弃
                const tempServer = new Server({ name: "yuque-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
                tempServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
                tempServer.setRequestHandler(CallToolRequestSchema, async (request) => {
                    const { name, arguments: args } = request.params;
                    const handler = handlers[name];
                    if (!handler)
                        return { content: [{ type: "text", text: `未知工具: ${name}` }], isError: true };
                    try {
                        const result = await handler(args || {});
                        return { content: [{ type: "text", text: result }] };
                    }
                    catch (error) {
                        return {
                            content: [{ type: "text", text: error instanceof YuqueAPIError
                                        ? `❌ 语雀 API 错误 [${error.statusCode}]: ${error.message}`
                                        : `❌ 执行失败: ${error.message}` }],
                            isError: true,
                        };
                    }
                });
                await tempServer.connect(transport);
                await transport.handleRequest(req, res, req.body);
                await transport.close();
            }
            catch (err) {
                console.error("MCP request error:", err);
                if (!res.headersSent)
                    res.status(500).json({ error: "Internal error" });
            }
        });
        // GET /mcp — SSE 流（streamable HTTP 需要）
        app.get("/mcp", async (_req, res) => {
            res.status(405).send("GET not supported in stateless mode");
        });
        // DELETE /mcp — session 清理
        app.delete("/mcp", async (_req, res) => {
            res.status(204).end();
        });
        app.listen(port, () => {
            console.error(`🦞 yuque-mcp HTTP server on http://localhost:${port}/mcp`);
        });
    }
    else {
        // stdio 模式（默认）
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("🦞 yuque-mcp server started");
    }
}
main().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map