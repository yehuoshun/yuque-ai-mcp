#!/usr/bin/env node
// 发布前把仓库根的资源复制进 server/，让 npm 包自带 config 示例 / API 文档 / SKILL / LICENSE。
// 原来写在 package.json 的 prepublishOnly 里用 mkdir -p + cp，在 Windows 的 cmd.exe 下必失败
// （mkdir -p 会被当成建 -p 目录、cp 不存在、2>/dev/null 会真写文件），这里改成纯 Node 实现。
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..");

const copies = [
  ["config/config.example.json", "config/config.example.json"],
  ["references", "references"],
  ["README.md", "README.md"],
  ["README_CN.md", "README_CN.md"],
  ["SKILL.md", "SKILL.md"],
  ["LICENSE", "LICENSE"],
];

let copied = 0;
for (const [from, to] of copies) {
  const src = resolve(repoRoot, from);
  const dst = resolve(pkgRoot, to);
  if (!existsSync(src)) {
    console.error(`跳过（源不存在）: ${src}`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  copied++;
  console.log(`已复制: ${from} -> ${to}`);
}
console.log(`copy-assets 完成，共 ${copied} 项`);
