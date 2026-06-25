export { searchGeneral } from "./search.js";
export { searchRag } from "./rag-search.js";
export { searchWeb } from "./web-search.js";
import { searchGeneral } from "./search.js";
import { searchRag } from "./rag-search.js";
import { searchWeb } from "./web-search.js";
import type { McpTool } from "../common/types.js";
export const searchTools: McpTool[] = [searchGeneral, searchRag, searchWeb];