import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface YuqueBook {
  book_id: number;
  namespace: string;
}

export interface YuqueConfig {
  token: string;
  group: string;
  default_book: YuqueBook;
  index_book: YuqueBook;
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

  const configPath = resolveConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `语雀配置文件不存在: ${configPath}\n请创建 config/yuque-config.json，格式参考 SKILL.md`
    );
  }

  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  cached = {
    token: raw.token || "",
    group: raw.group || "",
    default_book: normalizeBook(raw.default_book),
    index_book: normalizeBook(raw.index_book),
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

export function updateConfig(updates: Partial<YuqueConfig>): void {
  if (!cached) loadConfig();
  cached = { ...cached!, ...updates };
}