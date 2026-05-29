/** 搜索 token / 关键词清洗：去空格去符号 */
export declare function cleanToken(token: string): string;
/** 关键词数组 → 清洗 + JSON 序列化 */
export declare function cleanKeywordsArray(keywords: string[]): string;
export declare function extractLine(text: string, label: string): string;
export declare function extractSection(text: string, startLabel: string, endLabel: string): string;
export declare function parseKeywords(raw: string): string[];
