import { get } from "../../client.js";
import { loadConfig } from "../../config.js";
import { listAllDocs } from "./search.js";

const DOC_MAP_SLUG = "doc-map";

interface DocMapEntry {
  book_id: number;
  namespace: string;
  last_built: string;
}

interface ChangedDoc {
  doc_id: number;
  title: string;
  slug: string;
  updated_at: string;
  source_book_id: number;
  source_namespace: string;
}

/**
 * 增量对比：读 doc-map → 对比每个源库的 updated_at → 列出变更文档。
 *
 * doc-map 格式：
 * [{"book_id": 70910909, "namespace": "yehuoshun/huwsx0", "last_built": "2026-06-01T00:00:00Z"}]
 *
 * 对比逻辑：
 * 1. 知识库级：GET /repos/{book_id}.updated_at vs last_built → 相同跳过
 * 2. 文档级：list docs → 筛 updated_at > last_built → 返回变更列表
 */
export async function diffIndex(): Promise<string> {
  const config = loadConfig();
  const { route_books } = config;

  if (route_books.length === 0) {
    return JSON.stringify({
      error: "route_books 未配置",
      changed_docs: [],
      total: 0,
    }, null, 2);
  }

  const indexNamespace = route_books[0].namespace;

  // 1. 读 doc-map
  let docMap: DocMapEntry[];
  try {
    const data = await get(`/repos/${indexNamespace}/docs/${DOC_MAP_SLUG}`) as any;
    const body = (data.data || data).body || "";
    docMap = JSON.parse(body);
  } catch {
    return JSON.stringify({
      error: "doc-map 文档不存在或解析失败",
      changed_docs: [],
      total: 0,
    }, null, 2);
  }

  if (!Array.isArray(docMap) || docMap.length === 0) {
    return JSON.stringify({
      error: "doc-map 为空",
      changed_docs: [],
      total: 0,
    }, null, 2);
  }

  const allChanged: ChangedDoc[] = [];
  const errors: string[] = [];

  for (const entry of docMap) {
    // 2. 知识库级别对比
    try {
      const repoData = await get(`/repos/${entry.book_id}`) as any;
      const repo = repoData.data || repoData;
      const repoUpdatedAt = repo.updated_at || "";

      if (!repoUpdatedAt) {
        errors.push(`book_id=${entry.book_id}: 无法获取 updated_at`);
        continue;
      }

      if (repoUpdatedAt === entry.last_built) continue;

      // 3. 文档级别对比
      const allDocs = await listAllDocs(entry.book_id);
      const changedDocs = allDocs.filter(
        (d: any) => d.updated_at && d.updated_at > entry.last_built
      );

      for (const doc of changedDocs) {
        allChanged.push({
          doc_id: doc.id,
          title: doc.title || "",
          slug: doc.slug || "",
          updated_at: doc.updated_at,
          source_book_id: entry.book_id,
          source_namespace: entry.namespace,
        });
      }
    } catch (err: any) {
      errors.push(`book_id=${entry.book_id}: ${err.message || err}`);
    }
  }

  return JSON.stringify({
    changed_docs: allChanged,
    total: allChanged.length,
    doc_map_entries: docMap.length,
    errors: errors.length > 0 ? errors : undefined,
  }, null, 2);
}