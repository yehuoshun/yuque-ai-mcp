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

// 走完一次真实握手：SSE 拿到 endpoint 后再 POST /message，
// 这条用例专门盯「token 只在 /sse 生效、/message 全 401」那个坑（endpoint 必须自带凭据）
let sessionOk = false;
let sessionDetail = "no sse";
try {
  const ac = new AbortController();
  const sseRes = await fetch(`http://127.0.0.1:${PORT}/sse?token=${encodeURIComponent(TOKEN)}`, { signal: ac.signal });
  const reader = sseRes.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let endpoint = "";
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !endpoint) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    const m = /event: endpoint\ndata: (\S+)/.exec(buf);
    if (m) endpoint = m[1];
  }
  if (endpoint) {
    const post = await fetch(new URL(endpoint, `http://127.0.0.1:${PORT}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } }),
    });
    // 202 Accepted 是 SSEServerTransport 对 POST /message 的正常应答（消息入队即返回）
  sessionOk = post.status === 200 || post.status === 202;
    sessionDetail = endpoint + " -> " + post.status;
    await post.text().catch(() => "");
  } else {
    sessionDetail = "no endpoint event";
  }
  ac.abort();
  await reader.cancel().catch(() => {});
} catch (e) {
  sessionDetail = String(e).slice(0, 120);
}
add("SSE endpoint 自带凭据（initialize 能 POST 通）", sessionOk && /token=/.test(sessionDetail), sessionDetail);

child.kill("SIGTERM");
await wait(300);
try { child.kill("SIGKILL"); } catch {}
rmSync(dir, { recursive: true, force: true });

let failed = 0;
for (const c of checks) { console.log((c.ok ? "PASS" : "FAIL") + "  " + c.name + "  ::  " + c.detail); if (!c.ok) failed++; }
console.log("---- " + (checks.length - failed) + "/" + checks.length + " PASS ----");
process.exit(failed === 0 ? 0 : 1);
