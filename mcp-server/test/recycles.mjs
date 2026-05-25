#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "../../config/yuque-config.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));

const { cookie, ctoken } = config;
if (!cookie || !ctoken) {
  console.error("❌ 缺少 cookie 或 ctoken");
  process.exit(1);
}

const BASE = "https://www.yuque.com/api/mine/recycles";

async function webRequest(url, opts = {}) {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cookie": cookie,
    "x-csrf-token": ctoken,
    "Referer": "https://www.yuque.com/dashboard/recycles",
    "User-Agent": "Mozilla/5.0",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function test() {
  // 1. 列表
  console.log("=== 1. 列出回收站（前 5 条）===");
  const list = await webRequest(`${BASE}?offset=0&limit=5`);
  const items = list?.data?.data || [];
  const total = list?.data?.total ?? items.length;
  console.log(`总数: ${total}, 返回: ${items.length}`);
  for (const r of items) {
    const title = r.params?.doc?.title || r.params?.book?.name || "";
    console.log(`  [${r.id}] ${r.target_type} | ${title.slice(0, 60)} | ${r.params?.book?.name || ""}`);
  }

  // 2. 筛选 Doc
  console.log("\n=== 2. 筛选 Doc 类型（前 3 条）===");
  const filtered = await webRequest(`${BASE}?offset=0&limit=3&target_type=Doc`);
  const fitems = filtered?.data?.data || [];
  console.log(`过滤后: ${fitems.length} 条`);
  for (const r of fitems) {
    const title = r.params?.doc?.title || "";
    console.log(`  [${r.id}] ${r.target_type} | ${title.slice(0, 60)}`);
  }

  // 3. 测 restore 端点存在性（不真正恢复）
  if (items.length > 0) {
    const testId = items[0].id;
    console.log(`\n=== 3. 测试恢复端点存在性 (id=${testId}) ===`);
    try {
      const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": cookie,
        "x-csrf-token": ctoken,
        "Referer": "https://www.yuque.com/dashboard/recycles",
        "User-Agent": "Mozilla/5.0",
      };
      const res = await fetch(`${BASE}/${testId}/restore`, {
        method: "PUT",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(10_000),
      });
      console.log(`  状态码: ${res.status}`);
      const t = await res.text();
      console.log(`  响应: ${t.slice(0, 200)}`);
      if (res.ok) {
        console.log("  ✅ 恢复端点正常");
      }
    } catch (e) {
      console.log(`  错误: ${e.message}`);
    }
  }

  console.log("\n✅ 全部测试通过");
}

test().catch(e => {
  console.error("❌ 测试失败:", e.message);
  process.exit(1);
});