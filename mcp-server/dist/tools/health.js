import { get } from "../client.js";
/**
 * 健康检查：验证 Token 和知识库配置
 */
export async function healthCheck() {
    const results = [];
    // 1. Token 验证
    try {
        const hello = await get("/hello");
        const user = hello.data || hello;
        results.push(`✅ Token 有效 — 用户: ${user.login || user.name || "OK"}`);
    }
    catch (e) {
        if (e.statusCode === 401) {
            results.push("❌ Token 无效，请到 https://www.yuque.com/settings/tokens 重新生成");
        }
        else {
            results.push(`⚠️ Token 验证异常: ${e.message}`);
        }
    }
    // 2. 默认知识库检查
    try {
        const { default_book } = await import("../config.js").then((m) => ({
            default_book: m.loadConfig().default_book,
        }));
        if (default_book.book_id) {
            await get(`/repos/${default_book.book_id}`);
            results.push(`✅ 默认知识库: id=${default_book.book_id}`);
        }
        else {
            results.push("⏭️ 未配置默认知识库");
        }
    }
    catch (e) {
        results.push(`❌ 默认知识库不可用: ${e.message}`);
    }
    // 3. 索引库检查
    try {
        const { index_book } = await import("../config.js").then((m) => ({
            index_book: m.loadConfig().index_book,
        }));
        if (index_book.book_id) {
            await get(`/repos/${index_book.book_id}`);
            results.push(`✅ 索引库: id=${index_book.book_id}`);
        }
        else {
            results.push("⏭️ 未配置索引库");
        }
    }
    catch (e) {
        results.push(`❌ 索引库不可用: ${e.message}`);
    }
    return results.join("\n");
}
//# sourceMappingURL=health.js.map