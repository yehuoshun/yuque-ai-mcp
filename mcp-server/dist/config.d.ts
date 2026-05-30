export interface YuqueBook {
    book_id: number | string;
    namespace: string;
}
export interface YuqueConfig {
    token: string;
    group: string;
    default_book: YuqueBook;
    route_book: YuqueBook[];
    route_book_sub: YuqueBook[];
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
