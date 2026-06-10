export { searchGeneral } from "./search.js";
export { searchHyde } from "./hyde-search.js";
import { searchGeneral } from "./search.js";
import { searchHyde } from "./hyde-search.js";
import type { McpTool } from "../common/types.js";
export const searchTools: McpTool[] = [searchGeneral, searchHyde];
