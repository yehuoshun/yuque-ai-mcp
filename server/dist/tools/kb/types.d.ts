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
    weight?: number;
    tree?: {
        sections: Array<{
            id: string;
            title: string;
            summary: string;
        }>;
    };
}
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
    errors: {
        token: string;
        reason: string;
    }[];
    hint?: string;
}
export interface GraphShard {
    neighbors: Record<string, string[]>;
}
export interface DocEntry {
    doc_id: number;
    namespace: string;
    doc_title: string;
    slug: string;
    url: string;
    weight: number;
    keywords?: string[];
    search_surface?: string;
    summary?: string;
    tree?: {
        sections: Array<{
            id: string;
            title: string;
            summary: string;
        }>;
    };
}
export interface ParsedIndexDoc {
    entries: DocEntry[];
    parse_error?: string;
}
export interface CreateIndexDocParams {
    keyword: string;
    entries: DocEntry[];
}
