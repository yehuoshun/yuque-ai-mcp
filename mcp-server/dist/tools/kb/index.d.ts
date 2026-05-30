import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档（v3 — 关键词中心）
 *
 * 一个关键词 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * body 超过 195KB 时自动分片：关键词(1)、关键词(2) ...
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":10}]
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
/**
 * 解析索引文档 body → keywords / summary / entries（仅 JSON 格式）
 */
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
