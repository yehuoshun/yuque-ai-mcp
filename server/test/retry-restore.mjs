#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, "../../config/yuque-config.json"), "utf-8"));
const { cookie, ctoken } = config;

const headers = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Cookie": cookie,
  "x-csrf-token": ctoken,
  "Referer": "https://www.yuque.com/dashboard/recycles",
  "User-Agent": "Mozilla/5.0",
};

const BASE = "https://www.yuque.com/api/mine/recycles";

async function retry(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${id}/restore`, {
        method: "PUT", headers, body: "{}",
        signal: AbortSignal.timeout(15_000),
      });
      const t = await res.text();
      if (res.ok) {
        const title = (() => {
          try {
            const d = JSON.parse(t);
            return d?.data?.result?.params?.doc?.title || d?.data?.result?.params?.book?.name || "?";
          } catch { return "?"; }
        })();
        return { id, ok: true, title };
      }
      if (attempt < 3) {
        console.log(`  重试 ${attempt}/3: HTTP ${res.status}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { id, ok: false, error: `HTTP ${res.status}: ${t.slice(0, 60)}` };
    } catch (e) {
      if (attempt < 3) {
        console.log(`  重试 ${attempt}/3: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return { id, ok: false, error: e.message };
    }
  }
  return { id, ok: false, error: "未知错误" };
}

const ids = [94981075, 94979879, 94979878, 94979877, 94979781, 94941330];

console.log(`重试 ${ids.length} 条失败项...\n`);
const results = [];
for (const id of ids) {
  const r = await retry(id);
  results.push(r);
  if (r.ok) {
    console.log(`✅ [${r.id}] ${r.title}`);
  } else {
    console.log(`❌ [${r.id}] → ${r.error}`);
  }
}

const ok = results.filter(r => r.ok).length;
console.log(`\n结果: ${ok}/${ids.length} 成功`);