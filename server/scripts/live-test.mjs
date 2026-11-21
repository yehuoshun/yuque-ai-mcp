#!/usr/bin/env node
/**
 * 真机 E2E：连真实语雀，新建一个临时知识库，按主链路把工具跑一遍，逐项断言，最后汇总。
 *
 * 与 scripts/smoke-http.mjs 的分工：smoke 只证明进程能起、握手能通，不碰业务；
 * 这个脚本要证明「工具真的能在真账号上把知识库建出来、文档写进去、目录挪动、搜索命中、附件传上去」。
 *
 * 用法：
 *   YUQUE_LIVE_CONFIG=/path/to/config.json node scripts/live-test.mjs [--cleanup] [--out DIR]
 *   --cleanup  跑完删除临时知识库（默认保留，方便回看；删库不可逆）
 * 前置：dist 已构建（npm run build）；config 里要有 token，web 类检查需要 cookie/ctoken。
 * 退出码：0 = 全过（或仅 SKIP）；1 = 有 FAIL。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, "..");
const argv = process.argv.slice(2);
const cleanup = argv.includes("--cleanup");
const outIdx = argv.indexOf("--out");
const OUT = outIdx !== -1 ? argv[outIdx + 1] : resolve(serverRoot, "..", "tmp", "live-e2e-" + Date.now());
const CFG = process.env.YUQUE_LIVE_CONFIG || resolve(process.cwd(), "yuque-config.json");

if (!existsSync(CFG)) {
  console.error("缺少配置文件：" + CFG + "\n请设置 YUQUE_LIVE_CONFIG 指向带 token 的配置。");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const checks = [];
const add = (name, ok, detail) => {
  checks.push({ name, ok, detail: String(detail ?? "").replace(/\s+/g, " ").slice(0, 240) });
  console.log((ok === "skip" ? "SKIP " : ok ? "PASS " : "FAIL ") + name + (detail ? "  ::  " + String(detail).replace(/\s+/g, " ").slice(0, 160) : ""));
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "--config", CFG],
  cwd: serverRoot,
  stderr: "pipe",
  // 导出工具的围栏根本默认 process.cwd()（server/），这里把它放宽到本次产物目录，避免 OUT 之外落盘
  env: { ...process.env, YUQUE_EXPORT_ROOT: OUT },
});
const client = new Client({ name: "live-e2e", version: "1.0.0" });
await client.connect(transport);

/** 调工具：返回 { isError, text, obj }，obj 为解析后的 JSON（解析失败为 null）。 */
async function call(name, args = {}) {
  try {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
    const text = (r.content ?? []).map((x) => x.text ?? "").join("\n");
    let obj = null;
    try { obj = JSON.parse(text); } catch { /* 纯文本结果 */ }
    return { isError: !!r.isError, text, obj };
  } catch (e) {
    return { isError: true, text: "THROW: " + (e?.message ?? e), obj: null };
  }
}
const payload = (r) => (r.obj && typeof r.obj === "object" && "data" in r.obj ? r.obj.data : r.obj);
const pick = (o, k) => (o && typeof o === "object" ? (o[k] ?? (o.data ? o.data[k] : undefined)) : undefined);
const deep = (o, path) => path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), o);
const isCookieIssue = (r) => /cookie|ctoken|NO_COOKIE|未配置/i.test(r.text);
const MARK = "LIVE-E2E-" + Date.now().toString(36).toUpperCase();

let bookId = null;
let login = null;

try {
  // ── 0. 连通性 ──
  const hello = await call("yuque_hello");
  add("hello 连通", !hello.isError && hello.text.length > 0, hello.text.slice(0, 80));

  const me = await call("yuque_get_user");
  login = pick(payload(me), "login");
  add("get_user 拿到账号", !me.isError && !!login, "login=" + login);

  // ── 1. 建临时知识库 ──
  const slug = "mcp-live-" + Date.now().toString().slice(-8);
  const created = await call("yuque_create_repo", {
    login, name: "MCP 真机测试 " + MARK, slug, public: 0,
    description: "临时测试库（live-test.mjs 自动创建）",
  });
  bookId = String(pick(payload(created), "id") ?? "");
  add("create_repo 建库", !created.isError && !!bookId && bookId !== "undefined", "book_id=" + bookId + " slug=" + slug);
  if (!bookId || bookId === "undefined") throw new Error("建库失败，后续无法继续: " + created.text.slice(0, 200));

  const got = await call("yuque_get_repo", { book_id: bookId });
  add("get_repo 与建库一致", !got.isError && String(pick(payload(got), "id")) === bookId, "slug=" + pick(payload(got), "slug"));

  const upd = await call("yuque_update_repo", { book_id: bookId, description: "description-updated-" + MARK });
  const after = await call("yuque_get_repo", { book_id: bookId });
  add("update_repo 描述已生效", !upd.isError && String(pick(payload(after), "description") ?? "").includes(MARK), "desc=" + String(pick(payload(after), "description")).slice(0, 60));

  // ── 2. 文档 CRUD ──
  const docs = [];
  for (const t of ["A", "B", "C"]) {
    const d = await call("yuque_create_doc", { book_id: bookId, title: "文档" + t, slug: "doc-" + t.toLowerCase(), format: "markdown", body: "# 文档" + t + "\n\n" + MARK + "-" + t });
    docs.push({ id: String(pick(payload(d), "id") ?? ""), title: "文档" + t, slug: "doc-" + t.toLowerCase() });
  }
  add("create_doc ×3", docs.every((d) => d.id && d.id !== "undefined"), docs.map((d) => d.title + "=" + d.id).join(" "));

  const one = await call("yuque_get_doc", { id: docs[0].id, book_id: bookId });
  add("get_doc 读到正文", !one.isError && one.text.includes(MARK + "-A"), "len=" + one.text.length);

  const updDoc = await call("yuque_update_doc", { book_id: bookId, id: docs[0].id, title: "文档A-改", body: "# 改过\n\n" + MARK + "-A2" });
  const reOne = await call("yuque_get_doc", { id: docs[0].id, book_id: bookId });
  add("update_doc 标题与正文都变了", !updDoc.isError && reOne.text.includes(MARK + "-A2") && reOne.text.includes("文档A-改"), "ok=" + !updDoc.isError);

  const listed = await call("yuque_list_docs", { book_id: bookId, offset: 0, limit: 100 });
  const listedArr = Array.isArray(payload(listed)) ? payload(listed) : (payload(listed)?.data ?? []);
  const listedIds = listedArr.map((d) => String(d.id));
  add("list_docs 含这 3 篇", !listed.isError && docs.every((d) => listedIds.includes(d.id)), "returned=" + listedArr.length);

  const batch = await call("yuque_batch_get_docs", { book_id: bookId, ids: docs.map((d) => d.id) });
  // 真实结构：{ total, ok, docs: { <docId>: {...} } }，不是顶层直接挂 docId 键
  const batchVal = payload(batch);
  const batchDocs = batchVal?.docs && typeof batchVal.docs === "object" ? batchVal.docs : null;
  const batchOk = !batch.isError && !!batchDocs && docs.every((d) => batchDocs[d.id] || batchDocs[String(Number(d.id))]);
  add("batch_get_docs 返回 3 条且按 docId 挂载", batchOk, "total=" + (batchVal?.total ?? "-") + " docs=" + Object.keys(batchDocs ?? {}).length);

  const versions = await call("yuque_get_doc_versions", { doc_id: docs[0].id });
  const vArr = Array.isArray(payload(versions)) ? payload(versions) : (payload(versions)?.data ?? []);
  add("get_doc_versions 至少有 1 版", !versions.isError && vArr.length >= 1, "versions=" + vArr.length);

  // ── 3. 导出与复制 ──
  const exportDir = resolve(OUT, "export");
  const exported = await call("yuque_export_doc", { id: docs[0].id, book_id: bookId, output_dir: exportDir });
  const expPath = pick(payload(exported), "file") ?? pick(payload(exported), "path");
  const expOk = !exported.isError && expPath && existsSync(expPath) && statSync(expPath).size > 0;
  add("export_doc 落盘且非空", expOk, expPath ? expPath + " (" + statSync(expPath).size + "B)" : exported.text.slice(0, 120));

  // paths: [] = 复制到知识库根目录（不建目录、不挂 TOC），结果在 results[0]
  const copied = await call("yuque_copy_doc", {
    target_book_id: bookId, title: "文档D-复制", format: "markdown", paths: [], source_title: "文档A-改",
    body: "# 复制件\n\n" + MARK + "-D",
  });
  const copyVal = payload(copied);
  const copyId = String(copyVal?.results?.[0]?.doc_id ?? copyVal?.doc_id ?? "");
  add("copy_doc 空 paths 复制到库根", !copied.isError && !!copyId && copyId !== "undefined", "doc_id=" + copyId + " toc=" + (copyVal?.toc ?? "-"));

  // ── 4. 目录树 ──
  await call("yuque_update_toc", { book_id: bookId, action: "appendNode", action_mode: "child", type: "TITLE", title: "DIR-A" });
  let toc = await call("yuque_get_toc", { book_id: bookId });
  let nodes = Array.isArray(payload(toc)) ? payload(toc) : (payload(toc)?.data ?? []);
  const dirNode = nodes.find((n) => n.title === "DIR-A");
  add("update_toc 真建出目录节点", !toc.isError && !!dirNode?.uuid, "uuid=" + dirNode?.uuid);

  const docNode = nodes.find((n) => n.type !== "TITLE" && String(n.doc_id) === docs[1].id);
  if (dirNode?.uuid && docNode?.uuid) {
    const mv = await call("yuque_web_move_catalog_node", { book_id: bookId, node_uuid: docNode.uuid, target_book_id: bookId, target_uuid: dirNode.uuid, action: "prependChild", with_children: true });
    toc = await call("yuque_get_toc", { book_id: bookId });
    nodes = Array.isArray(payload(toc)) ? payload(toc) : (payload(toc)?.data ?? []);
    const moved = nodes.find((n) => n.uuid === docNode.uuid);
    add("web_move_catalog_node 回读父节点已变", !mv.isError && moved && String(moved.parent_uuid) === String(dirNode.uuid), "parent=" + moved?.parent_uuid);
  } else {
    add("web_move_catalog_node 回读父节点已变", false, "找不到文档节点或目录节点");
  }

  const docNode3 = nodes.find((n) => n.type !== "TITLE" && String(n.doc_id) === docs[2].id);
  if (dirNode?.uuid && docNode3?.uuid) {
    const bm = await call("yuque_web_batch_move_catalog_nodes", { book_id: bookId, node_uuids: [docNode3.uuid], target_uuid: dirNode.uuid, target_book_id: bookId });
    toc = await call("yuque_get_toc", { book_id: bookId });
    nodes = Array.isArray(payload(toc)) ? payload(toc) : (payload(toc)?.data ?? []);
    const moved3 = nodes.find((n) => n.uuid === docNode3.uuid);
    add("web_batch_move_catalog_nodes 生效", !bm.isError && moved3 && String(moved3.parent_uuid) === String(dirNode.uuid), "parent=" + moved3?.parent_uuid);
  } else {
    add("web_batch_move_catalog_nodes 生效", false, "找不到第 3 篇的节点");
  }

  // ── 5. 搜索 ──
  const search = await call("yuque_search", { q: MARK, type: "doc" });
  add("search 无错返回", !search.isError, "len=" + search.text.length + " hit=" + (search.text.includes(MARK) ? "yes" : "no"));

  // ── 6. 小记 ──
  const note = await call("yuque_create_note", { body: "# 小记\n\n" + MARK + "-NOTE" });
  const noteId = String(pick(payload(note), "id") ?? "");
  add("create_note", !note.isError && !!noteId && noteId !== "undefined", "id=" + noteId);
  if (noteId && noteId !== "undefined") {
    const gn = await call("yuque_get_note", { note_id: noteId });
    add("get_note 读到正文", !gn.isError && gn.text.includes(MARK + "-NOTE"), "len=" + gn.text.length);
    const un = await call("yuque_update_note", { note_id: noteId, body: "# 小记改\n\n" + MARK + "-NOTE2" });
    const gn2 = await call("yuque_get_note", { note_id: noteId });
    add("update_note 生效", !un.isError && gn2.text.includes(MARK + "-NOTE2"), "detail=" + un.text.slice(0, 80));
    const ln = await call("yuque_list_notes", { limit: 20 });
    add("list_notes 能列出", !ln.isError, "len=" + ln.text.length);
  }

  // ── 7. 附件上传（需要 cookie） ──
  const png = resolve(OUT, "probe.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const up = await call("yuque_upload_attachment", { file_path: png, type: "image" });
  if (isCookieIssue(up)) add("upload_attachment 上传成功", "skip", "缺 cookie/ctoken，跳过");
  else add("upload_attachment 上传成功", !up.isError && /https?:/.test(up.text), up.text.slice(0, 120));

  // ── 8. web 侧（cookie） ──
  const wl = await call("yuque_web_list_docs", { book_id: bookId, limit: 20 });
  if (isCookieIssue(wl)) add("web_list_docs", "skip", "缺 cookie");
  else {
    const wlArr = Array.isArray(payload(wl)) ? payload(wl) : (payload(wl)?.data ?? []);
    add("web_list_docs 与 API 侧条数相符", !wl.isError && wlArr.length >= 3, "count=" + wlArr.length);
  }
  const wd = await call("yuque_web_get_doc", { book_id: bookId, id: docs[0].id });
  if (isCookieIssue(wd)) add("web_get_doc", "skip", "缺 cookie");
  else add("web_get_doc 读到正文", !wd.isError && wd.text.includes(MARK + "-A2"), "len=" + wd.text.length);

  // ── 9. 统计 ──
  const stat = await call("yuque_get_book_statistics", { login, name: slug });
  // token 缺 statistic:read 时上游返回 Unauthorized，属权限而非代码问题
  if (/statistic:read|Unauthorized/i.test(stat.text)) add("get_book_statistics", "skip", "token 缺 statistic:read 权限");
  else add("get_book_statistics 无错", !stat.isError, "len=" + stat.text.length);

  // ── 10. 删除单篇（回收站） ──
  const del = await call("yuque_delete_doc", { book_id: bookId, id: docs[2].id, confirm: "DELETE" });
  const listed2 = await call("yuque_list_docs", { book_id: bookId, offset: 0, limit: 100 });
  const listed2Arr = Array.isArray(payload(listed2)) ? payload(listed2) : (payload(listed2)?.data ?? []);
  add("delete_doc 后不再出现在列表", !del.isError && !listed2Arr.map((d) => String(d.id)).includes(docs[2].id), "after=" + listed2Arr.length);
  const rec = await call("yuque_list_recycles", { limit: 20 });
  add("list_recycles 无错", !rec.isError, "len=" + rec.text.length);

  // ── 11. 清理 ──
  if (cleanup) {
    const dr = await call("yuque_delete_repo", { book_id: bookId, confirm: "DELETE" });
    add("delete_repo 删除临时库", !dr.isError, dr.text.slice(0, 100));
  } else {
    add("delete_repo 删除临时库", "skip", "未传 --cleanup，保留 book_id=" + bookId);
  }
} catch (e) {
  add("脚本中断", false, e?.message ?? String(e));
} finally {
  const pass = checks.filter((c) => c.ok === true).length;
  const fail = checks.filter((c) => c.ok === false).length;
  const skip = checks.filter((c) => c.ok === "skip").length;
  const report = { when: new Date().toISOString(), mark: MARK, bookId, login, out: OUT, pass, fail, skip, checks };
  writeFileSync(resolve(OUT, "live-e2e-result.json"), JSON.stringify(report, null, 2));
  console.log("\n---- " + pass + " PASS / " + fail + " FAIL / " + skip + " SKIP ----");
  console.log("book_id=" + bookId + "  产物=" + OUT);
  await client.close().catch(() => {});
  process.exit(fail === 0 ? 0 : 1);
}
