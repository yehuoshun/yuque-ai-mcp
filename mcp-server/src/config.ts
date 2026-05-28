import { readFileSync, existsSync } from "fs";
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
  route_book: YuqueBook[];   // 索引总库列表（存 [路由] 文档，可多总库分片）
  route_sub: YuqueBook[];    // 默认子索引库列表（创建索引文档时未指定目标用）
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

export function loadConfig(): YuqueConfig {
  if (cached) return cached;

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
      route_sub: parseBookList("YUQUE_ROUTE_SUB"),
      cookie: process.env.YUQUE_COOKIE || undefined,
      ctoken: process.env.YUQUE_CTOKEN || undefined,
      user_id: process.env.YUQUE_USER_ID || undefined,
    };
    return cached;
  }

  // 回退到配置文件（本地开发方式）
  const configPath = resolveConfigPath();
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
    route_sub: normalizeBooks(raw.route_sub || raw.index_book),
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