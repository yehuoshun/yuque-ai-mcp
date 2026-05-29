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
}

// 源文档指针（写入索引文档的 entries）
export interface DocEntry {
  did: number;
  ns: string;
  t?: string;
  s?: string;
}

// 解析后的单篇索引文档
export interface ParsedIndexDoc {
  keywords: string[];
  summary: string;
  entries: DocEntry[];
  parse_error?: string;
}

export interface SubIndexPointer {
  book_id: number | string;
  namespace: string;
}

export interface SubIndexResult {
  entries: SourceEntry[];
  indexDocsHit: number;
  sourceDocsHit: number;
  dirtyBlocks: number;
  errors: { token: string; reason: string }[];
  ns: string;
}

export interface CreateIndexDocParams {
  keyword: string;
  keywords: string[];
  summary: string;
  entries: DocEntry[];
  index_book_id: number | string;
}
