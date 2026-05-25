#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, "../../config/yuque-config.json"), "utf-8"));
const { cookie, ctoken } = config;

const res = await fetch("https://www.yuque.com/api/mine/editor_center", {
  headers: {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Cookie": cookie,
    "x-csrf-token": ctoken,
    "Referer": "https://www.yuque.com/settings/stats",
    "User-Agent": "Mozilla/5.0",
  },
  signal: AbortSignal.timeout(15_000),
});

const d = (await res.json()).data;

console.log("📊 个人写作仪表盘\n");
console.log(`📚 知识库: ${d.books_count} (30d +${d.books_count_30})`);
console.log(`📄 文档: ${d.docs_count.toLocaleString()} (30d +${d.docs_count_30.toLocaleString()}, 公开 ${d.docs_public_count})`);
console.log(`✏️  编辑: ${d.edit_times_all.toLocaleString()} 次, ${d.edit_days_all} 天`);
console.log(`📝 字数: ${(d.word_count / 1e8).toFixed(1)} 亿 (最多: ${d.max_word_book_info.name} ${(d.max_word_count_book / 1e8).toFixed(1)}亿)`);
console.log(`👍 获赞: ${d.liked_count_all} | 小记: ${d.notes_count.toLocaleString()}`);
console.log(`👥 活跃协作者: ${d.interactive_users.map(u => u.name).join(', ')}`);
console.log(`📅 平台天数: ${d.days}`);
console.log(`\n✅ yuque_get_user_stats 正常工作`);