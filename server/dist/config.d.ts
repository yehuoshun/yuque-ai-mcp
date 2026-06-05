export interface YuqueBook {
    book_id: number | string;
    namespace: string;
}
export interface YuqueConfig {
    token: string;
    group: string;
    route_books: YuqueBook[];
    graph_book?: YuqueBook;
    index_concurrency: number;
    search_concurrency: number;
    cookie?: string;
    ctoken?: string;
    user_id?: string;
}
/** 暴露配置路径，方便外部检查 */
export declare function getConfigPath(): string;
/**
 * 强制重新加载配置（清除缓存后从文件/环境变量重新读取）
 * @param force 是否强制重读（默认 true）。设为 false 仅在不强制时检查 mtime
 */
export declare function reloadConfig(force?: boolean): YuqueConfig;
export declare function loadConfig(): YuqueConfig;
export declare function updateConfig(updates: Partial<YuqueConfig>): void;
/** 持久化配置到 config/yuque-config.json */
export declare function saveConfig(): void;
/** 追加索引库条目 */
export declare function addRouteBooks(book: YuqueBook): void;
/** 设置图谱库 */
export declare function addGraphBook(book: YuqueBook): void;
