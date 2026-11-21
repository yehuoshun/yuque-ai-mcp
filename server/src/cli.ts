#!/usr/bin/env node
/**
 * yuque-mcp CLI — stdio 模式
 * 用法：yuque-mcp [--config /path/to/config.json]
 */
import { spawn } from "child_process";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// 用当前解释器而不是 PATH 里的 node：nvm/volta 切版本后子进程才不会走到别的 Node，
// 精简容器里 PATH 无 node 时也不会以 spawn ENOENT 的形式炸掉。
const child = spawn(process.execPath, [resolve(__dirname, "index.js"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env },
});
// 把终止信号转给子进程，否则进程管理器杀的是包装进程，真正干活的子进程变孤儿占着端口
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
