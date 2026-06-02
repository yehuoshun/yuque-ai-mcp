// 搜索结果中返回的源文档指针
export interface SourceEntry {
  did: number;
  ns: string;
  title?: string;
  url?: string;
  keywords?: string[];
  summary?: string;
  sub_index_ns?: string;
  parse_error?: string;
  weight?: number;  // 来自 DocEntry.w，LLM 拟合度 1-10
}

// 源文档指针（写入索引文档的 entries）
export interface DocEntry {
  did: number;
  ns: string;
  t: string;
  s: string;
  url: string;
  w: number;  // 权重 1-10，LLM 判断该文档与关键词的拟合度（必填）
}

// 解析后的单篇索引文档
export interface ParsedIndexDoc {
  keywords: string[];
  summary: string;
  entries: DocEntry[];
  parse_error?: string;
}

// 总库路由指向的索引文档
export interface RouteEntry {
  did: number;
  ns: string;
}

export interface CreateIndexDocParams {
  keyword: string;
  keywords: string[];
  summary: string;
  entries: DocEntry[];
  index_book_id: number | string;
  route_book_id?: number | string;
}