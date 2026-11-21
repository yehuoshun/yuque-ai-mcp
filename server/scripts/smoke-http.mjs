#!/usr/bin/env node
// CI 冒烟：真正启动 HTTP 模式，验证鉴权与回环绑定（在 Linux runner 上同时证明「能跑起来」）
// 用法：node scripts/smoke-http.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "smoke-" + Math.random().toString(16).slice(2);
const PORT = 3099 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), "yuque-mcp-smoke-"));
const cfg = join(dir, "yuque-config.json");
writeFileSync(cfg, JSON.stringify({ token: "dummy-token-for-smoke", api_base: "https://www.yuque.com/api/v2" }));

const child = spawn(process.execPath, ["dist/http.js", "--config", cfg], {
  env: { ...process.env, YUQUE_MCP_HTTP_TOKEN: TOKEN, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });

let up = false;
for (let i = 0; i < 40; i++) {
  await wait(250);
  try {
    const r = await fetch("http://127.0.0.1:" + PORT + "/health");
    if (r.ok) { up = true; add("服务在 Linux/本机启动并响应 /health", true, r.status); break; }
  } catch {}
}
if (!up) add("服务启动", false, out.slice(-300));

const sseNoAuth = await fetch("http://127.0.0.1:" + PORT + "/sse").catch(() => null);
add("/sse 无凭据 401 且不回 CORS 通配", sseNoAuth && sseNoAuth.status === 401 && !sseNoAuth.headers.get("access-control-allow-origin"), sseNoAuth ? sseNoAuth.status : "no response");
const health = await fetch("http://127.0.0.1:" + PORT + "/health").catch(() => null);
add("/health 公开可达", health && health.ok, health ? health.status : "no response");

child.kill("SIGTERM");
await wait(300);
try { child.kill("SIGKILL"); } catch {}
rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) { console.log((c.ok ? "PASS" : "FAIL") + "  " + c.name + "  ::  " + c.detail); if (!c.ok) failed++; }
console.log("---- " + (checks.length - failed) + "/" + checks.length + " PASS ----");
process.exit(failed === 0 ? 0 : 1);
