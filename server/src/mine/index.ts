export { mineBookStacks } from "./get-book-stacks.js";
export { mineEditorCenter } from "./editor-center.js";
import { mineBookStacks } from "./get-book-stacks.js";
import { mineEditorCenter } from "./editor-center.js";
import type { McpTool } from "../common/types.js";
export const mineTools: McpTool[] = [mineBookStacks, mineEditorCenter];
