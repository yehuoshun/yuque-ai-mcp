export { resourceGet } from "./get-resource.js";
export { resourceCreate } from "./create-resource.js";
export { resourceUpdate } from "./update-resource.js";
import { resourceGet } from "./get-resource.js";
import { resourceCreate } from "./create-resource.js";
import { resourceUpdate } from "./update-resource.js";
import type { McpTool } from "../common/types.js";
export const resourceTools: McpTool[] = [resourceGet, resourceCreate, resourceUpdate];
