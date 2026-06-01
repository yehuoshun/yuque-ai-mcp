import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/tools");

const user = await import(resolve(distDir, "user.js"));
const repos = await import(resolve(distDir, "repos.js"));
const docs = await import(resolve(distDir, "docs.js"));
const notes = await import(resolve(distDir, "notes.js"));
const search = await import(resolve(distDir, "search.js"));
const exportTools = await import(resolve(distDir, "export.js"));
const groups = await import(resolve(distDir, "groups.js"));
const statistic = await import(resolve(distDir, "statistic.js"));

async function label(name, fn) {
  process.stderr.write(`\n--- ${name} ---\n`);
  try {
    const r = await fn();
    const tooLong = typeof r === "string" && r.length > 600;
    process.stdout.write(tooLong ? r.slice(0, 600) + "\n...(截断)" : r + "\n");
  } catch (e) {
    process.stdout.write(`❌ ${e.message}\n`);
  }
}

async function main() {
  const login = "yehuoshun";
  const bid = 78276514;

  // === 用户 & 健康检查 ===
  await label("healthCheck", () => user.healthCheck());
  await label("getUser", () => user.getUser());

  // === 知识库 ===
  await label("listRepos", () => repos.listRepos());
  await label("getRepo (id)", () => repos.getRepo({ id_or_namespace: String(bid) }));
  await label("getRepo (namespace)", () => repos.getRepo({ id_or_namespace: "yehuoshun/index-sub-1" }));

  // === 文档 ===
  const dl = await docs.listDocs({ book_id: bid, limit: 3 });
  process.stdout.write(`listDocs:\n${dl}\n`);
  const m = dl.match(/id=(\d+)/);
  const did = m ? parseInt(m[1]) : null;
  process.stderr.write(`\n[doc_id: ${did}]\n`);

  if (did) {
    await label("getDoc (JSON)", () => docs.getDoc({ book_id: bid, doc_id: did }));
    await label("getDoc (raw)", () => docs.getDoc({ book_id: bid, doc_id: did, raw: true }));
    await label("listDocVersions", () => docs.listDocVersions({ doc_id: did }));
    await label("exportDoc", () => exportTools.exportDoc({ book_id: bid, doc_id: did }).then(r => r.length > 80 ? r.slice(0, 80) + "..." : r));
  }

  await label("listDocs (optional)", () => docs.listDocs({ book_id: bid, limit: 2, optional_properties: "hits,latest_version_id" }));

  // === TOC ===
  await label("listToc", () => docs.listToc({ book_id: bid }).then(r => r.length > 600 ? r.slice(0, 600) + "...\n(截断)" : r));

  // === 小记 ===
  await label("listNotes", () => notes.listNotes({ limit: 3 }));

  // === 搜索 ===
  await label("search (scope)", () => search.search({ query: "Docker", scope: "yehuoshun/rqgc16" }));
  await label("search (全库)", () => search.search({ query: "Java" }));

  // === 群组 ===
  await label("listGroupUsers", () => groups.listGroupUsers({ login }).catch(e => `⏭️ ${e.message}`));

  // === 统计 ===
  await label("groupStats", () => statistic.getGroupStats({ login }).catch(e => `⏭️ ${e.message}`));
  await label("memberStats", () => statistic.getMemberStats({ login }).catch(e => `⏭️ ${e.message}`));
  await label("bookStats", () => statistic.getBookStats({ login }).catch(e => `⏭️ ${e.message}`));
  await label("docStats", () => statistic.getDocStats({ login }).catch(e => `⏭️ ${e.message}`));
}

await main();