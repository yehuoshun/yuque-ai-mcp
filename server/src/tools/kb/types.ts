// 搜索结果中返回的源文档指针
export interface SourceEntry {
  doc_id: number;
  namespace: string;
  title?: string;
  url?: string;
  keywords?: string[];
  search_surface?: string;
  summary?: string;
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
  route_hits: number;                    // 路由命中数
  source_entries: SourceEntry[];         // 去重排序后的源文档指针
  graph_expanded: boolean;              // 是否触发了图谱扩展
  graph_neighbors: string[];            // 图谱扩展的邻居关键词
  fallback_used: "none" | "global_search"; // 降级策略
  dirty_blocks: number;                 // 索引文档 body 解析失败的个数
  errors: { token: string; reason: string }[];
  hint?: string;                        // 建议下一步操作
}

// _graph 索引文档 body 格式
export interface GraphDoc {
  built_at?: string;
  nodes?: number;
  edges?: number;
  communities?: Array<{
    id: number;
    label: string;
    keywords: string[];
    cohesion: number;
  }>;
}

// 源文档指针（写入索引文档 body）
// body 格式：JSON 数组，每项为一个 DocEntry
export interface DocEntry {
  doc_id: number;
  namespace: string;
  doc_title: string;
  slug: string;
  url: string;
  weight: number;  // 权重 1-10
  // 每个 entry 的自有元数据（一对多场景）
  title?: string;        // entry 文档标题
  keywords?: string[];   // entry 关键词
  search_surface?: string; // entry 搜索面
  summary?: string;      // entry 摘要
  tree?: {              // 章节树（文档 > 5000 字时可选）
    sections: Array<{
      id: string;
      title: string;
      summary: string;
    }>;
  };
}

// 解析后的索引文档 body（JSON 数组 → DocEntry[]）
export interface ParsedIndexDoc {
  entries: DocEntry[];
  parse_error?: string;
}

// 总库路由指向的索引文档
export interface RouteEntry {
  book_namespace: string;
}

export interface CreateIndexDocParams {
  keyword: string;       // 文档标题（也是关键词，经 cleanToken 清洗）
  entries: DocEntry[];
  index_book_id: number | string;
  route_book_id?: number | string;
}