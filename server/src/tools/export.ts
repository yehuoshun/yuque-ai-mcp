import { get } from "../client.js";

/**
 * 批量获取多篇文档的 Markdown body
 * 底层走 get_doc API（export 端点已不存在于语雀 v2 API）
 */
export async function batchGetDocsBody(params: {
  docs: Array<{ book_id: number | string; doc_id: number }>;
}): Promise<string> {
  const results: Array<{
    doc_id: number;
    title: string;
    body: string;
    format: string;
    error?: string;
  }> = [];

  const concurrency = 5;
  for (let i = 0; i < params.docs.length; i += concurrency) {
    const batch = params.docs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ book_id, doc_id }) => {
        try {
          const data = await get(`/repos/${book_id}/docs/${doc_id}`);
          const doc = (data as any).data || data;
          return {
            doc_id,
            title: doc.title || "",
            body: doc.body || "",
            format: doc.format || "unknown",
          };
        } catch (e: any) {
          return {
            doc_id,
            title: "",
            body: "",
            format: "unknown",
            error: e.message || String(e),
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return JSON.stringify(
    {
      total: results.length,
      success: results.filter((r) => !r.error).length,
      failed: results.filter((r) => r.error).length,
      results,
    },
    null,
    2
  );
}