export { recycleList } from "./list-recycles.js";
export { recycleRestore } from "./restore-recycle.js";
export { recycleDestroy } from "./destroy-recycle.js";
import { recycleList } from "./list-recycles.js";
import { recycleRestore } from "./restore-recycle.js";
import { recycleDestroy } from "./destroy-recycle.js";
import type { McpTool } from "../common/types.js";
export const recycleTools: McpTool[] = [recycleList, recycleRestore, recycleDestroy];
