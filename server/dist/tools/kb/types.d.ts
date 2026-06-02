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
}
export interface DocEntry {
    doc_id: number;
    namespace: string;
    doc_title: string;
    slug: string;
    url: string;
    weight: number;
    title?: string;
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
export interface RouteEntry {
    did: number;
    ns: string;
}
export interface CreateIndexDocParams {
    keyword: string;
    entries: DocEntry[];
    index_book_id: number | string;
    route_book_id?: number | string;
}
