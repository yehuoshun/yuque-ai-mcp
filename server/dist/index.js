#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { YuqueAPIError } from "./shared/types.js";
import { loadDarkArts } from "./tools/dark-arts-loader.js";
import { reloadConfig } from "./config.js";
// ---- tools ----
import { listRepos, getRepo, createRepo, updateRepo, deleteRepo } from "./tools/repos.js";
import { listBookStacks, createBookStack, updateBookStack, sortBookStacks, moveBooks } from "./tools/book-stacks/index.js";
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc, listToc, updateToc, listDocVersions, getDocVersion } from "./tools/docs.js";
import { cloneDocToToc, getTocFlat, copyDocsCrossBook, batchMountToc } from "./tools/toc/index.js";
import { listNotes, getNote, createNote, updateNote, deleteNote, restoreNote } from "./tools/notes.js";
import { search } from "./tools/search.js";
import { batchGetDocsBody } from "./tools/export.js";
import { healthCheck, getUser, getUserStats } from "./tools/user.js";
import { listGroupUsers, updateGroupUser, removeGroupUser } from "./tools/groups.js";
import { getGroupStats, getMemberStats, getBookStats, getDocStats } from "./tools/statistic.js";
import { uploadAttachment } from "./tools/upload.js";
import { importDoc } from "./tools/import.js";
import { listRecycles, restoreRecycle, destroyRecycle } from "./tools/recycles.js";
// ---- tool definitions ----
const tools = [
    // --- 知识库 ---
    {
        name: "yuque_list_repos",
        description: "列出当前用户的所有语雀知识库（不传 offset 则自动翻页全量获取）",
        inputSchema: {
            type: "object",
            properties: {
                offset: { type: "number", description: "分页偏移（可选，传了只拿一页；不传自动翻页全量）" },
            },
            required: [],
        },
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
        description: "更新知识库目录（创建 TITLE/DOC 分组、移动/编辑/删除节点（removeNode+sibling+node_uuid））。创建根级 TITLE 用 appendNode+sibling+type:TITLE+title+target_uuid；创建子 TITLE 用 appendNode+child+target_uuid；移动 DOC 到分组下需先 removeNode 再 appendNode child+doc_ids+target_uuid；编辑用 editNode+sibling+node_uuid+title；删除用 removeNode+sibling+node_uuid",
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
    // --- 目录增强 ---
    {
        name: "yuque_clone_doc_to_toc",
        description: "将文档内容复制到多个目录位置（多目录支持）。语雀 TOC 是 1:1 的，多目录通过物理复制实现：读取源文档 → 在每个目标分类下创建独立副本，各自挂载。返回每个副本的 doc_id",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace" },
                doc_id: { type: "number", description: "源文档 ID（要复制的文档）" },
                target_uuids: { type: "array", items: { type: "string" }, description: "TOC 父节点 UUID 列表，每个位置创建一个副本" },
                action_mode: { type: "string", enum: ["sibling", "child"], description: "挂载模式：child=子节点（默认），sibling=同级" },
            },
            required: ["book_id", "doc_id", "target_uuids"],
        },
    },
    {
        name: "yuque_get_toc_flat",
        description: "获取知识库目录的扁平化缓存结构，返回 {nodes, roots, doc_map}。批量操作时用此缓存避免反复调 yuque_list_toc，大幅节省 API 调用",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace" },
            },
            required: ["book_id"],
        },
    },
    // --- 跨库复制 ---
    {
        name: "yuque_copy_docs_cross_book",
        description: "跨知识库批量复制文档（源库不动，只复制到目标库）。场景：A 库整理到 B 库，A 库保留。逐个 GET 源文档 → CREATE 到目标库，不删除源库。未指定 doc_ids 时复制全部文档",
        inputSchema: {
            type: "object",
            properties: {
                source_book_id: { type: ["number", "string"], description: "源知识库 ID 或 namespace" },
                target_book_id: { type: ["number", "string"], description: "目标知识库 ID 或 namespace" },
                doc_ids: { type: "array", items: { type: "number" }, description: "可选，指定要复制的文档 ID 列表；不传则复制全部" },
                concurrency: { type: "number", description: "并发数，默认 3" },
            },
            required: ["source_book_id", "target_book_id"],
        },
    },
    // --- 批量挂载（TOC 构建）---
    {
        name: "yuque_batch_mount_toc",
        description: "批量创建 TITLE 节点并将文档挂载到目录分类下（一步到位）。1) 先按分类创建 TITLE 节点，2) 再将文档批量 appendNode child 挂到对应 TITLE 下。支持 parent_uuid 创建子级目录",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace" },
                categories: { type: "object", description: "分类映射 JSON：{分类名: [doc_id, ...]}，按文档数降序自动排列" },
                parent_uuid: { type: "string", description: "可选，父 TITLE 的 UUID。传了则创建的 TITLE 作为子节点（child）；不传则作为根级节点（sibling）" },
                batch_size: { type: "number", description: "每批挂载的文档数，默认 100" },
            },
            required: ["book_id", "categories"],
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
        description: "在知识库中创建文档，自动挂载到目录。支持指定 target_uuid 精准挂到某个目录节点下，省去先创建再移动的二次调用",
        inputSchema: {
            type: "object",
            properties: {
                book_id: { type: ["number", "string"], description: "知识库 ID 或 namespace" },
                title: { type: "string", description: "文档标题" },
                body: { type: "string", description: "文档正文" },
                format: { type: "string", enum: ["markdown", "html", "lake"], description: "内容格式（默认 markdown）" },
                slug: { type: "string", description: "文档路径（可选）" },
                public: { type: "number", enum: [0, 1, 2], description: "0=私密 1=公开 2=企业内公开（不填继承知识库）" },
                target_uuid: { type: "string", description: "挂载到的 TOC 父节点 UUID（空字符串=根级，默认）。指定即精准挂到对应节点下" },
                action_mode: { type: "string", enum: ["sibling", "child"], description: "挂载模式：child=子节点（默认），sibling=同级" },
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
                book_id: { type: ["number", "string"], description: "目标知识库 ID 或 namespace" },
                body: { type: "string", description: "预适配好的正文（可选。提供后跳过文件读取和 regex 适配，仅做图片上传+创建文档）" },
                title: { type: "string", description: "文档标题（可选。不填则从 frontmatter/文件名/H1 提取）" },
                skip_images: { type: "boolean", description: "跳过图片上传（默认 false，无 cookie 时自动跳过）" },
                upload_original: { type: "boolean", description: "上传原始文件作为附件引用（默认 false）" },
            },
            required: [],
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
        description: "批量获取多篇文档的 Markdown 正文（并发数 5，底层走 get_doc。语雀 v2 无 /export 端点，get_doc 的 body 字段即 Markdown 原文）",
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
    // --- 配置管理 ---
    {
        name: "yuque_reload_config",
        description: "重新加载 config/yuque-config.json 配置文件（修改配置后无需重启 MCP Server）",
        inputSchema: { type: "object", properties: {}, required: [] },
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
    yuque_clone_doc_to_toc: (a) => cloneDocToToc(a),
    yuque_get_toc_flat: (a) => getTocFlat(a),
    yuque_copy_docs_cross_book: (a) => copyDocsCrossBook(a),
    yuque_batch_mount_toc: (a) => batchMountToc(a),
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
    yuque_get_group_stats: (a) => getGroupStats(a),
    yuque_get_member_stats: (a) => getMemberStats(a),
    yuque_get_book_stats: (a) => getBookStats(a),
    yuque_get_doc_stats: (a) => getDocStats(a),
    yuque_list_recycles: (a) => listRecycles(a),
    yuque_restore_recycle: (a) => restoreRecycle(a),
    yuque_destroy_recycle: (a) => destroyRecycle(a),
    yuque_reload_config: async () => { reloadConfig(); return `✅ 配置已重新加载`; },
};
// ---- 统一错误格式化 & handler 工厂（stdio + HTTP 共用）----
function formatToolError(error) {
    if (error instanceof YuqueAPIError) {
        return JSON.stringify({
            error: `API_${error.statusCode}`,
            message: error.message,
            status_code: error.statusCode,
        }, null, 2);
    }
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: "EXECUTION_ERROR", message: msg }, null, 2);
}
async function handleCallTool(request) {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
        return {
            content: [{ type: "text", text: JSON.stringify({ error: "UNKNOWN_TOOL", message: `未知工具: ${name}` }, null, 2) }],
            isError: true,
        };
    }
    try {
        const result = await handler(args || {});
        return { content: [{ type: "text", text: result }] };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: formatToolError(error) }],
            isError: true,
        };
    }
}
// ---- server ----
const server = new Server({ name: "yuque-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, handleCallTool);
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
                const tempServer = new Server({ name: "yuque-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
                tempServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
                tempServer.setRequestHandler(CallToolRequestSchema, handleCallTool);
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