export { crawlFetch } from "./fetch.js";
export { crawlExtract } from "./extract.js";
export { crawlSave } from "./save.js";

import { crawlFetch } from "./fetch.js";
import { crawlExtract } from "./extract.js";
import { crawlSave } from "./save.js";
import type { McpTool } from "../common/types.js";

export const crawlerTools: McpTool[] = [crawlFetch, crawlExtract, crawlSave];
