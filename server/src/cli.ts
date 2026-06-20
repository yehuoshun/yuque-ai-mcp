#!/usr/bin/env node
/**
 * yuque-mcp CLI — stdio 模式
 * 用法：yuque-mcp [--config /path/to/config.json]
 */
import { spawn } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const child = spawn("node", [resolve(__dirname, "index.js")], {
  stdio: "inherit",
  env: { ...process.env },
});
child.on("exit", (code) => process.exit(code ?? 0));
