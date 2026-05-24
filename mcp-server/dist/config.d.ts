export interface YuqueBook {
    book_id: number | string;
    namespace: string;
}
export interface YuqueConfig {
    token: string;
    group: string;
    default_book: YuqueBook;
    index_book: YuqueBook;
    cookie?: string;
    ctoken?: string;
    user_id?: string;
}
export declare function loadConfig(): YuqueConfig;
export declare function updateConfig(updates: Partial<YuqueConfig>): void;
