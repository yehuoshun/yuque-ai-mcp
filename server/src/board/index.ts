export { boardGet } from "./get-board.js";
export { boardCreate } from "./create-board.js";
export { boardUpdate } from "./update-board.js";
import { boardGet } from "./get-board.js";
import { boardCreate } from "./create-board.js";
import { boardUpdate } from "./update-board.js";
import type { McpTool } from "../common/types.js";
export const boardTools: McpTool[] = [boardGet, boardCreate, boardUpdate];
