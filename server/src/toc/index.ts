export { tocGet } from "./get-toc.js";
export { tocUpdate } from "./update-toc.js";
import { tocGet } from "./get-toc.js";
import { tocUpdate } from "./update-toc.js";
import type { McpTool } from "../common/types.js";
export const tocTools: McpTool[] = [tocGet, tocUpdate];
