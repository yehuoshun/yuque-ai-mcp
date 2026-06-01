export interface SourceEntry {
    did: number;
    ns: string;
    title?: string;
    url?: string;
    keywords?: string[];
    summary?: string;
    sub_index_ns?: string;
    parse_error?: string;
    weight?: number;
}
export interface DocEntry {
    did: number;
    ns: string;
    t: string;
    s: string;
    url: string;
    w: number;
}
export interface ParsedIndexDoc {
    keywords: string[];
    summary: string;
    entries: DocEntry[];
    parse_error?: string;
}
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
}
