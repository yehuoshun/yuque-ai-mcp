import { CreateIndexDocParams, ParsedIndexDoc } from "./types.js";
/**
 * 创建关键词索引文档（v5 — 一对一精准锚点）
 *
 * 一个关键词 = 一篇源文档 = 一篇索引文档。标题就是关键词本身，命中直接对得上。
 * entries 必须且只有 1 个。
 *
 *   关键词：["SpringBoot","SpringBoot启动","自动配置"]
 *   摘要：...
 *   entries：
 *   [{"did":584,"ns":"yehuoshun/dil9w3","t":"Spring Boot 自动配置原理","s":"abc","url":"https://www.yuque.com/yehuoshun/dil9w3/abc","w":9}]
 */
export declare function createIndexDoc(params: CreateIndexDocParams): Promise<string>;
/**
 * 解析索引文档 body → keywords / summary / entries
 */
export declare function parseIndexDoc(body: string): ParsedIndexDoc;
