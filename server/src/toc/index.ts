export { tocGet } from "./get-toc.js";
export { tocUpdate } from "./update-toc.js";
export { tocBatchUpdate } from "./batch-update.js";
import { tocGet } from "./get-toc.js";
import { tocUpdate } from "./update-toc.js";
import { tocBatchUpdate } from "./batch-update.js";
import type { McpTool } from "../common/types.js";
export const tocTools: McpTool[] = [tocGet, tocUpdate, tocBatchUpdate];
