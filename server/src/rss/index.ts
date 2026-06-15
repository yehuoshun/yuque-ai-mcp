export { rssListSources } from "./list-sources.js";
export { rssFetch } from "./fetch-feed.js";
import { rssListSources } from "./list-sources.js";
import { rssFetch } from "./fetch-feed.js";
import type { McpTool } from "../common/types.js";
export const rssTools: McpTool[] = [rssListSources, rssFetch];