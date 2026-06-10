export { userGet } from "./get-user.js";
export { userHello } from "./hello.js";
export { userGetGroups } from "./get-groups.js";
import { userGet } from "./get-user.js";
import { userHello } from "./hello.js";
import { userGetGroups } from "./get-groups.js";
import type { McpTool } from "../common/types.js";
export const userTools: McpTool[] = [userGet, userHello, userGetGroups];
