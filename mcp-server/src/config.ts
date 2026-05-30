import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface YuqueBook {
  book_id: number | string;
  namespace: string;
}

export interface YuqueConfig {
  token: string;
  group: string;
  default_book: YuqueBook;
  route_book: YuqueBook[];   // 索引总库列表（存路由文档，可多总库分片）
  route_book_sub: YuqueBook[];    // 默认子索引库列表（创建索引文档时未指定目标用）
  index_concurrency: number;  // 索引构建并发数（默认 1，语雀 API 限流严格建议保守）
  search_concurrency: number; // 搜索并发数（默认 5）
  cookie?: string;
  ctoken?: string;
  user_id?: string;
}

function resolveConfigPath(): string {
  // 1. env override
  if (process.env.YUQUE_CONFIG_PATH) {
    return process.env.YUQUE_CONFIG_PATH;
  }
  // 2. skill config (relative to mcp-server/src → ../../config/)
  return resolve(__dirname, "../../config/yuque-config.json");
}

let cached: YuqueConfig | null = null;
let lastMtimeMs = 0;
let configFilePath = "";

/** 暴露配置路径，方便外部检查 */
export function getConfigPath(): string {
  return configFilePath || resolveConfigPath();
}

/**
 * 强制重新加载配置（清除缓存后从文件/环境变量重新读取）
 * @param force 是否强制重读（默认 true）。设为 false 仅在不强制时检查 mtime
 */
export function reloadConfig(force = true): YuqueConfig {
  if (force) {
    cached = null;
    lastMtimeMs = 0;
  }
  return loadConfig();
}

export function loadConfig(): YuqueConfig {
  // 优先读环境变量（npm 包安装方式），环境变量不变，缓存有效
  if (cached && process.env.YUQUE_TOKEN) return cached;

  // 优先读环境变量（npm 包安装方式）
  if (process.env.YUQUE_TOKEN) {
    let cookie = process.env.YUQUE_COOKIE || undefined;
    let ctoken = process.env.YUQUE_CTOKEN || undefined;
    let fileUserId: string | undefined;

    // cookie/ctoken 是易变配置，优先 env，兜底读 config 文件避免硬编码在启动参数里
    if (!cookie || !ctoken) {
      try {
        const configPath = resolveConfigPath();
        if (existsSync(configPath)) {
          const raw = JSON.parse(readFileSync(configPath, "utf-8"));
          if (!cookie) cookie = raw.cookie;
          if (!ctoken) ctoken = raw.ctoken;
          if (!fileUserId) fileUserId = raw.user_id;
        }
      } catch { /* ignore file errors, use env values */ }
    }

    cached = {
      token: process.env.YUQUE_TOKEN,
      group: process.env.YUQUE_GROUP || "",
      default_book: normalizeBook({
        book_id: process.env.YUQUE_DEFAULT_BOOK_ID ? parseInt(process.env.YUQUE_DEFAULT_BOOK_ID) : 0,
        namespace: process.env.YUQUE_DEFAULT_BOOK_NS || "",
      }),
      route_book: parseBookList("YUQUE_ROUTE_BOOK"),
      route_book_sub: parseBookList("YUQUE_ROUTE_SUB"),
      index_concurrency: parseInt(process.env.YUQUE_INDEX_CONCURRENCY || "1"),
      search_concurrency: parseInt(process.env.YUQUE_SEARCH_CONCURRENCY || "5"),
      cookie,
      ctoken,
      user_id: process.env.YUQUE_USER_ID || fileUserId || undefined,
    };
    return cached;
  }

  // 回退到配置文件（本地开发方式）——每次检查 mtime，文件变了自动重读
  const configPath = resolveConfigPath();
  configFilePath = configPath;

  // mtime 检查：文件未变且有缓存 → 直接返回
  try {
    const stat = statSync(configPath);
    if (cached && stat.mtimeMs === lastMtimeMs) return cached;
    lastMtimeMs = stat.mtimeMs;
  } catch {
    // 文件不存在，继续往下抛错
  }

  if (!existsSync(configPath)) {
    throw new Error(
      `语雀配置缺失。请设置环境变量 YUQUE_TOKEN 和 YUQUE_GROUP，或创建 ${configPath}`
    );
  }

  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  cached = {
    token: raw.token || "",
    group: raw.group || "",
    default_book: normalizeBook(raw.default_book),
    route_book: normalizeBooks(raw.route_book),
    route_book_sub: normalizeBooks(raw.route_book_sub || raw.index_book),
    index_concurrency: raw.index_concurrency || 1,
    search_concurrency: raw.search_concurrency || 5,
    cookie: raw.cookie || undefined,
    ctoken: raw.ctoken || undefined,
    user_id: raw.user_id || undefined,
  };

  if (!cached.token || !cached.group) {
    throw new Error("config/yuque-config.json 缺少 token 或 group");
  }

  return cached;
}

function normalizeBook(raw: any): YuqueBook {
  return {
    book_id: raw?.book_id ?? 0,
    namespace: raw?.namespace ?? "",
  };
}

function normalizeBooks(raw: any): YuqueBook[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(normalizeBook).filter((b: YuqueBook) => b.book_id && b.namespace);
}

/** 从环境变量解析 JSON 数组格式的 book 列表 */
function parseBookList(prefix: string): YuqueBook[] {
  // YUQUE_ROUTE_BOOK='[{"book_id":123,"namespace":"xx"}]'
  const raw = process.env[prefix];
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return normalizeBooks(arr);
  } catch {
    return [];
  }
}

export function updateConfig(updates: Partial<YuqueConfig>): void {
  if (!cached) loadConfig();
  cached = { ...cached!, ...updates };
}

/** 持久化配置到 config/yuque-config.json */
export function saveConfig(): void {
  if (!cached) throw new Error("配置未加载，无法保存");
  const configPath = getConfigPath();

  // 确保目录存在
  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // 读现有文件（保留非路由字段）
  let raw: any = {};
  try {
    if (existsSync(configPath)) {
      raw = JSON.parse(readFileSync(configPath, "utf-8"));
    }
  } catch { /* 文件损坏则覆盖 */ }

  // 覆盖路由配置
  raw.route_book = cached.route_book;
  raw.route_book_sub = cached.route_book_sub;
  if (cached.default_book.book_id) raw.default_book = cached.default_book;

  writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n", "utf-8");

  // 更新 mtime 避免重读循环
  try {
    lastMtimeMs = statSync(configPath).mtimeMs;
  } catch {}
}

/** 追加总库路由条目 */
export function addRouteBook(book: YuqueBook): void {
  if (!cached) loadConfig();
  const exists = cached!.route_book.some(b => String(b.book_id) === String(book.book_id));
  if (!exists) {
    cached!.route_book = [...cached!.route_book, book];
    saveConfig();
  }
}

/** 追加子索引库条目 */
export function addRouteBookSub(book: YuqueBook): void {
  if (!cached) loadConfig();
  const exists = cached!.route_book_sub.some(b => String(b.book_id) === String(book.book_id));
  if (!exists) {
    cached!.route_book_sub = [...cached!.route_book_sub, book];
    saveConfig();
  }
}