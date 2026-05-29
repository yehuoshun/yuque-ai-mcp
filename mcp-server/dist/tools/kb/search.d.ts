/**
 * 知识库搜索 — 管道全自动（双层：路由 + 子索引库）
 */
export declare function kbSearch(params: {
    tokens: string[];
    route_ns?: string;
    route_id?: number | string;
}): Promise<string>;
