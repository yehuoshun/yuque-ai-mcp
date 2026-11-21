#!/usr/bin/env node
/**
 * yuque-mcp-http CLI — HTTP SSE 模式（端口 3099）
 * 用法：yuque-mcp-http [--config /path/to/config.json]
 * 端口/监听地址走环境变量 PORT（默认 3099）、HOST（默认 127.0.0.1）
 */
import { spawn } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const args = [resolve(__dirname, "http.js"), ...process.argv.slice(2)];
const child = spawn("node", args, {
  stdio: "inherit",
  env: { ...process.env },
});
child.on("exit", (code) => process.exit(code ?? 0));