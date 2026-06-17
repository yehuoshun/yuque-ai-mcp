/**
 * mine/editor-center — 获取个人编辑中心全景数据
 *
 * 端点：GET /api/mine/editor_center（Web API，Cookie 认证）
 * 职责：返回当前用户的知识库数、文档数、字数、编辑次数、活跃天数、
 *       互动用户、最多字的知识库等全景统计数据
 */

import type { McpTool } from "../common/types.js";
import { webRequest, MINE_BASE } from "./common.js";

export const mineEditorCenter: McpTool = {
  name: "yuque_get_editor_center",
  description: "获取个人编辑中心全景数据：知识库数、文档数、总字数、编辑次数、活跃天数、互动用户排行、最多字的知识库等。需要 cookie+ctoken 认证。GET /api/mine/editor_center",

  inputSchema: {
    type: "object",
    properties: {},
  },

  async handler() {
    const data = (await webRequest(`${MINE_BASE}/editor_center`)) as {
      data?: {
        books_count: number;
        books_count_30: number;
        books_count_365: number;
        days: number;
        docs_count: number;
        docs_count_30: number;
        docs_count_365: number;
        word_count: number;
        word_count_30: number;
        word_count_365: number;
        edit_times_all: number;
        edit_times_30: number;
        edit_times_365: number;
        edit_days_all: number;
        edit_days_30: number;
        edit_days_365: number;
        edit_doc_count_all: number;
        edit_doc_count_30: number;
        edit_doc_count_365: number;
        liked_count_all: number;
        liked_count_30: number;
        liked_count_365: number;
        notes_count: number;
        notes_count_30: number;
        notes_count_365: number;
        selections: number;
        public_doc_likes: number;
        public_doc_likes_30: number;
        public_doc_likes_365: number;
        docs_public_count: number;
        docs_public_count_30: number;
        docs_public_count_365: number;
        interactive_users: Array<{
          name: string;
          login: string;
          avatar_url: string;
        }>;
        max_word_book_info?: {
          name: string;
          items_count: number;
        };
      };
    };

    const d = data?.data;
    if (!d) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NO_DATA" }, null, 2) }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          overview: {
            books: { all: d.books_count, last_30d: d.books_count_30, last_365d: d.books_count_365 },
            docs: { all: d.docs_count, last_30d: d.docs_count_30, last_365d: d.docs_count_365 },
            public_docs: { all: d.docs_public_count, last_30d: d.docs_public_count_30, last_365d: d.docs_public_count_365 },
            notes: { all: d.notes_count, last_30d: d.notes_count_30, last_365d: d.notes_count_365 },
            words: { all: d.word_count, last_30d: d.word_count_30, last_365d: d.word_count_365 },
            selections: d.selections,
            days_since_join: d.days,
          },
          editing: {
            edit_times: { all: d.edit_times_all, last_30d: d.edit_times_30, last_365d: d.edit_times_365 },
            edit_days: { all: d.edit_days_all, last_30d: d.edit_days_30, last_365d: d.edit_days_365 },
            edit_doc_count: { all: d.edit_doc_count_all, last_30d: d.edit_doc_count_30, last_365d: d.edit_doc_count_365 },
          },
          engagement: {
            liked: { all: d.liked_count_all, last_30d: d.liked_count_30, last_365d: d.liked_count_365 },
            public_likes: { all: d.public_doc_likes, last_30d: d.public_doc_likes_30, last_365d: d.public_doc_likes_365 },
            interactive_users: d.interactive_users || [],
          },
          max_word_book: d.max_word_book_info
            ? { name: d.max_word_book_info.name, items_count: d.max_word_book_info.items_count }
            : null,
        }, null, 2),
      }],
    };
  },
};
