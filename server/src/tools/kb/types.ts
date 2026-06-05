// 搜索结果中返回的源文档指针
export interface SourceEntry {
  doc_id: number;
  namespace: string;
  title?: string;
  url?: string;
  keywords?: string[];
  sub_index_ns?: string;
  parse_error?: string;
  weight?: number;  // LLM 拟合度 1-10
  tree?: {          // 章节树（透传给 Agent 做树搜索）
    sections: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
  };
}

// yuque_kb_search 结构化返回
export interface KbSearchResult {
  tokens: string[];
  index_hits: number;
  source_entries: SourceEntry[];
  total_entries: number;
  truncated: boolean;
  graph_expanded: boolean;
  graph_neighbors: string[];
  fallback_used: "none" | "global_search";
  dirty_blocks: number;
  errors: { token: string; reason: string }[];
  hint?: string;
}

export interface GraphShard {
  neighbors: Record<string, string[]>;
}

// 源文档指针（MCP tool 输入 / 结构化读取输出）
export interface DocEntry {
  doc_id: number;
  namespace: string;
  doc_title: string;
  slug: string;
  url: string;
  weight: number;
  keywords?: string[];      // 关键词数组
  search_surface?: string; // 该文档的搜索面文本
  summary?: string;        // 该文档的摘要
  tree?: {
    sections: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
  };
}

// 解析后的索引文档 body
export interface ParsedIndexDoc {
  entries: DocEntry[];
  parse_error?: string;
}

export interface CreateIndexDocParams {
  keyword: string;
  entries: DocEntry[];
  index_book_id: number | string;
}
