#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { YuqueAPIError } from "./shared/types.js";
import { loadDarkArts } from "./tools/dark-arts-loader.js";

// ---- tools ----
import { listRepos, getRepo, createRepo, updateRepo, deleteRepo } from "./tools/repos.js";
import { listDocs, getDoc, createDoc, updateDoc, deleteDoc, listToc, updateToc, removeTocNode, listDocVersions, getDocVersion } from "./tools/docs.js";
import { listNotes, getNote, createNote, updateNote, deleteNote, restoreNote } from "./tools/notes.js";
import { search } from "./tools/search.js";
import { batchGetDocsBody } from "./tools/export.js";
import { healthCheck, getUser, getUserStats } from "./tools/user.js";
import { listGroupUsers, updateGroupUser, removeGroupUser } from "./tools/groups.js";
import { getGroupStats, getMemberStats, getBookStats, getDocStats } from "./tools/statistic.js";
import { uploadAttachment } from "./tools/upload.js";
import { importDoc } from "./tools/import.js";
import { kbSearch, createIndexDoc } from "./tools/kb.js";
import { listRecycles, restoreRecycle, destroyRecycle } from "./tools/recycles.js";
import { reloadConfig } from "./config.js";

// ---- tool definitions ----
const tools: Tool[] = [
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
    description: "批量获取多篇文档的 Markdown 正文（并发 5，底层走 get_doc。语雀 v2 无 /export 端点，get_doc 的 body 字段即 Markdown 原文）",
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
    description: "知识库管道搜索（双层：路由 + 子索引库）。输入搜索 token 数组，自动从 config 读索引总库，路由到匹配的子索引库并行搜索。返回 Markdown 文本（title/url/summary/keywords + 脏块标记）。错误和脏块不静默。",
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
    description: "创建关键词索引文档。一个关键词 = 一篇索引文档，标题就是关键词本身（不含符号前缀，语雀搜索符号匹配差）。body 含关键词 JSON 数组 + 摘要 + entries 源文档指针。自动挂 TOC。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "索引关键词（直接用作文档标题，不含符号）" },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "搜索面关键词数组（同义词/变体/缩写/口语问法/拼音），代码层 cleanToken 清洗每元素后 JSON 序列化存入",
        },
        summary: { type: "string", description: "摘要（100-200 字，覆盖该关键词下所有源文档的核心内容）" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              did: { type: "number", description: "源文档 ID" },
              ns: { type: "string", description: "源知识库 namespace（如 yehuoshun/dil9w3）" },
              t: { type: "string", description: "源文档标题" },
              s: { type: "string", description: "源文档 slug" },
            },
            required: ["did", "ns"],
          },
          description: "源文档指针列表",
        },
        index_book_id: { type: ["number", "string"], description: "子索引库 book_id" },
      },
      required: ["keyword", "keywords", "summary", "entries", "index_book_id"],
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

  // --- 回收站 ---
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
const handlers: Record<string, (args: any) => Promise<string>> = {
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

  yuque_get_group_stats: (a) => getGroupStats(a),
  yuque_get_member_stats: (a) => getMemberStats(a),
  yuque_get_book_stats: (a) => getBookStats(a),
  yuque_get_doc_stats: (a) => getDocStats(a),

  yuque_list_recycles: (a) => listRecycles(a),
  yuque_restore_recycle: (a) => restoreRecycle(a),
  yuque_destroy_recycle: (a) => destroyRecycle(a),

  yuque_reload_config: async () => { const c = reloadConfig(); return `✅ 配置已重新加载（${c.route_book.length} 个总库 / ${c.route_book_sub.length} 个子库）`; },
};

// ---- server ----
const server = new Server(
  { name: "yuque-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

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
  } catch (error: any) {
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
  // 🕶️ 动态加载邪修玩法（子模块不存在则跳过）
  const darkArts = await loadDarkArts();
  if (darkArts.tools.length > 0) {
    tools.push(...darkArts.tools);
    Object.assign(handlers, darkArts.handlers);
    console.error(`🕶️ dark-arts: ${darkArts.tools.length} tools 已加载`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🦞 yuque-mcp server started");
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});