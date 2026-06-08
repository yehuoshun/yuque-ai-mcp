export interface YuqueConfig {
    token: string;
    group: string;
    cookie?: string;
    ctoken?: string;
    user_id?: string;
}
export declare function getConfigPath(): string;
export declare function reloadConfig(force?: boolean): YuqueConfig;
export declare function loadConfig(): YuqueConfig;
