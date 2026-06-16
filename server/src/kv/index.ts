export { kvGet } from "./get.js";
export { kvSet } from "./set.js";
export { kvDelete } from "./delete.js";
export { kvList } from "./list.js";

import { kvGet } from "./get.js";
import { kvSet } from "./set.js";
import { kvDelete } from "./delete.js";
import { kvList } from "./list.js";
import type { McpTool } from "../common/types.js";

export const kvTools: McpTool[] = [kvGet, kvSet, kvDelete, kvList];
