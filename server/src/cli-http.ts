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
// 同 cli.ts：用当前解释器 + 转发终止信号（容器/进程管理器停服务时要真停到 http.js）
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env },
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
