import { get } from "../../client.js";
import { loadConfig } from "../../config.js";
import { parseIndexDoc } from "./index.js";
import { DocEntry } from "./types.js";

interface FoundEntry {
  keyword: string;
  book_id: number | string;
  index_doc_id: number;
  entry: DocEntry;
}

/**
 * 反向查找：给定源文档 doc_id，找出索引库中所有包含它的关键词索引文档。
 *
 * 用语雀搜索 API 搜索引库 body 中的 doc_id 数字
 * → 读命中的索引文档 → parseIndexDoc → 过滤 entry.doc_id === doc_id
 */
export async function reverseLookup(params: {
  doc_id: number;
}): Promise<string> {
  const { doc_id } = params;
  const config = loadConfig();
  const { route_books } = config;

  if (route_books.length === 0) {
    return JSON.stringify({
      doc_id,
      error: "route_books 未配置",
      found_in: [],
      total: 0,
    }, null, 2);
  }

  const allFound: FoundEntry[] = [];

  for (const rb of route_books) {
    try {
      const data = await get(
        `/search?q=${doc_id}&type=doc&scope=${rb.namespace}`
      ) as any;
      const results: any[] = data.data || [];

      const hits = results
        .map((r: any) => {
          const info = r.target || r;
          return { id: info.id || r.id, title: (info.title || r.title || "").trim() };
        })
        .filter((h: any) => h.id);

      const readResults = await Promise.all(
        hits.map(async (hit: { id: number; title: string }) => {
          try {
            const docData = await get(`/repos/${rb.book_id}/docs/${hit.id}`) as any;
            return {
              index_doc_id: hit.id,
              keyword: hit.title,
              body: (docData.data || docData).body || "",
            };
          } catch {
            return { index_doc_id: hit.id, keyword: hit.title, body: "" };
          }
        })
      );

      for (const doc of readResults) {
        if (!doc.body) continue;
        const parsed = parseIndexDoc(doc.body);
        if (parsed.parse_error) continue;
        for (const entry of parsed.entries) {
          if (entry.doc_id === doc_id) {
            allFound.push({
              keyword: doc.keyword,
              book_id: rb.book_id,
              index_doc_id: doc.index_doc_id,
              entry,
            });
          }
        }
      }
    } catch { /* 单个索引库失败不阻塞 */ }
  }

  return JSON.stringify({
    doc_id,
    found_in: allFound,
    total: allFound.length,
  }, null, 2);
}