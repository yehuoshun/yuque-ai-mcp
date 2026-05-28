import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveConfigPath() {
    // 1. env override
    if (process.env.YUQUE_CONFIG_PATH) {
        return process.env.YUQUE_CONFIG_PATH;
    }
    // 2. skill config (relative to mcp-server/src → ../../config/)
    return resolve(__dirname, "../../config/yuque-config.json");
}
let cached = null;
export function loadConfig() {
    if (cached)
        return cached;
    // 优先读环境变量（npm 包安装方式）
    if (process.env.YUQUE_TOKEN) {
        cached = {
            token: process.env.YUQUE_TOKEN,
            group: process.env.YUQUE_GROUP || "",
            default_book: normalizeBook({
                book_id: process.env.YUQUE_DEFAULT_BOOK_ID ? parseInt(process.env.YUQUE_DEFAULT_BOOK_ID) : 0,
                namespace: process.env.YUQUE_DEFAULT_BOOK_NS || "",
            }),
            route_book: parseBookList("YUQUE_ROUTE_BOOK"),
            route_book_sub: parseBookList("YUQUE_ROUTE_SUB"),
            cookie: process.env.YUQUE_COOKIE || undefined,
            ctoken: process.env.YUQUE_CTOKEN || undefined,
            user_id: process.env.YUQUE_USER_ID || undefined,
        };
        return cached;
    }
    // 回退到配置文件（本地开发方式）
    const configPath = resolveConfigPath();
    if (!existsSync(configPath)) {
        throw new Error(`语雀配置缺失。请设置环境变量 YUQUE_TOKEN 和 YUQUE_GROUP，或创建 ${configPath}`);
    }
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    cached = {
        token: raw.token || "",
        group: raw.group || "",
        default_book: normalizeBook(raw.default_book),
        route_book: normalizeBooks(raw.route_book),
        route_book_sub: normalizeBooks(raw.route_book_sub || raw.index_book),
        cookie: raw.cookie || undefined,
        ctoken: raw.ctoken || undefined,
        user_id: raw.user_id || undefined,
    };
    if (!cached.token || !cached.group) {
        throw new Error("config/yuque-config.json 缺少 token 或 group");
    }
    return cached;
}
function normalizeBook(raw) {
    return {
        book_id: raw?.book_id ?? 0,
        namespace: raw?.namespace ?? "",
    };
}
function normalizeBooks(raw) {
    if (!raw)
        return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map(normalizeBook).filter((b) => b.book_id && b.namespace);
}
/** 从环境变量解析 JSON 数组格式的 book 列表 */
function parseBookList(prefix) {
    // YUQUE_ROUTE_BOOK='[{"book_id":123,"namespace":"xx"}]'
    const raw = process.env[prefix];
    if (!raw)
        return [];
    try {
        const arr = JSON.parse(raw);
        return normalizeBooks(arr);
    }
    catch {
        return [];
    }
}
export function updateConfig(updates) {
    if (!cached)
        loadConfig();
    cached = { ...cached, ...updates };
}
//# sourceMappingURL=config.js.map