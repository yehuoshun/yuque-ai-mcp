#!/usr/bin/env node
/**
 * yuque-mcp-http CLI — HTTP SSE 模式（端口 3099）
 * 用法：yuque-mcp-http [--config /path/to/config.json] [--port 3099]
 */
import { spawn } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const args = [resolve(__dirname, "http.js")];
const child = spawn("node", args, {
  stdio: "inherit",
  env: { ...process.env },
});
child.on("exit", (code) => process.exit(code ?? 0));