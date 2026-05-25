#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, "../../config/yuque-config.json"), "utf-8"));
const { cookie, ctoken } = config;

const BASE = "https://www.yuque.com/api/mine/recycles";
const headers = {
  "Accept": "application/json",
  "Content-Type": "application/json",
  "Cookie": cookie,
  "x-csrf-token": ctoken,
  "Referer": "https://www.yuque.com/dashboard/recycles",
  "User-Agent": "Mozilla/5.0",
};

async function fetchAll() {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${BASE}?offset=${offset}&limit=100`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    const data = await res.json();
    const items = data?.data?.data || [];
    if (items.length === 0) break;
    all.push(...items);
    console.error(`  获取: offset=${offset}, 当前 ${all.length} 条`);
    offset += 100;
  }
  return all;
}

async function restoreBatch(items, concurrency = 5) {
  let done = 0;
  let failed = 0;
  const queue = [...items];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const title = item.params?.doc?.title || item.params?.book?.name || "";
      try {
        const res = await fetch(`${BASE}/${item.id}/restore`, {
          method: "PUT",
          headers,
          body: "{}",
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          done++;
        } else {
          failed++;
          console.error(`  ❌ [${item.id}] ${title.slice(0, 40)} → HTTP ${res.status}`);
        }
      } catch (e) {
        failed++;
        console.error(`  ❌ [${item.id}] ${title.slice(0, 40)} → ${e.message}`);
      }
      if ((done + failed) % 20 === 0) {
        console.error(`  进度: ${done + failed}/${items.length} (成功 ${done}, 失败 ${failed})`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return { done, failed };
}

console.log("🦞 开始批量恢复回收站...\n");

console.log("📋 获取回收站列表...");
const items = await fetchAll();
console.log(`  共 ${items.length} 条\n`);

console.log(`🔄 开始恢复 (并发 5)...`);
const { done, failed } = await restoreBatch(items, 5);

console.log(`\n✅ 完成: 成功 ${done}, 失败 ${failed}, 总计 ${items.length}`);