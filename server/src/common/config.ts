/**
 * config — 读取 config/config.json
 *
 * 所有工具模块通过此文件获取配置，不再依赖环境变量。
 *
 * slug 格式：`{book_id}/{doc_id}`，用 / 分割解析。
 * kv_slugs / schedule_slugs 均为数组，支持多文档。
 *
 * RSS 源定义在 config.json 的 rss.sources 中，不硬编码在代码里。
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 查找 config 文件：--config 参数 → cwd → ~/.yuque-mcp → 开发路径 */
function findConfigPath(): string {
  const cliArg = process.argv.findIndex(a => a === "--config" || a === "-c");
  if (cliArg !== -1 && process.argv[cliArg + 1]) {
    return process.argv[cliArg + 1];
  }
  const cwdPath = resolve(process.cwd(), "yuque-config.json");
  if (existsSync(cwdPath)) return cwdPath;
  const homePath = resolve(homedir(), ".yuque-mcp", "config.json");
  if (existsSync(homePath)) return homePath;
  const devPath = resolve(__dirname, "../../../config/config.json");
  if (existsSync(devPath)) return devPath;
  return resolve(homedir(), ".yuque-mcp", "config.json");
}

// ── 类型定义 ──

interface NamespaceConfig {
  book_id: number[];
  kv_slugs?: string[];
  schedule_slugs?: string[];
}

/** RSS Feed 定义（config.json 中配置） */
export interface RssFeedDef {
  label: string;
  description?: string;
  url?: string;
  url_template?: string;
  params_schema?: Record<string, { type: "string" | "number"; description: string; required?: boolean; default?: string | number }>;
}

/** RSS 源定义（config.json 中配置） */
export interface RssSourceDef {
  name: string;
  description?: string;
  feeds: Record<string, RssFeedDef>;
  /** 从文章链接提取站点文章 ID 的正则，capture group 1 即为 slug。不配则 fallback 到 md5 */
  slug_pattern?: string;
}

interface RssConfig {
  enabled: boolean;
  sources?: Record<string, RssSourceDef>;
  namespaces?: Record<string, NamespaceConfig>;
}

interface KvConfig {
  enabled: boolean;
}

interface CrawlerConfig {
  enabled: boolean;
  namespaces?: Record<string, NamespaceConfig>;
}

interface Config {
  token: string;
  api_base: string;
  cookie?: string;
  ctoken?: string;
  rss?: RssConfig;
  kv?: KvConfig;
  crawler?: CrawlerConfig;
}

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const configPath = findConfigPath();
  try {
    const raw = readFileSync(configPath, "utf-8");
    _config = JSON.parse(raw) as Config;
  } catch {
    throw new Error(
      `无法读取配置文件。请将 config.example.json 复制为 yuque-config.json（当前目录）或 ~/.yuque-mcp/config.json，并填入 Token。\n` +
      `Cannot read config. Copy config.example.json to yuque-config.json (cwd) or ~/.yuque-mcp/config.json.`
    );
  }

  if (!_config.token || _config.token === "在此填入语雀 API Token") {
    throw new Error("请在 config/config.json 中填入有效的语雀 API Token / Please fill in a valid Yuque API Token in config/config.json");
  }

  _config.api_base = _config.api_base || "https://www.yuque.com/api/v2";
  return _config;
}

/** 从 config 加载 RSS 源定义 */
export function loadRssSources(): Record<string, RssSourceDef> {
  return loadConfig().rss?.sources ?? {};
}

/** 持久化 config 到文件 */
export function saveConfig(): void {
  if (!_config) return;
  const configPath = findConfigPath();
  writeFileSync(configPath, JSON.stringify(_config, null, 2) + "\n", "utf-8");
}

/** 解析 slug：`{book_id}/{doc_id}` → { bookId, docId } */
export function parseSlug(slug: string): { bookId: number; docId: number } | null {
  const parts = slug.split("/");
  if (parts.length !== 2) return null;
  const bookId = parseInt(parts[0], 10);
  const docId = parseInt(parts[1], 10);
  if (isNaN(bookId) || isNaN(docId)) return null;
  return { bookId, docId };
}

/** 组装 slug：bookId/docId */
export function buildSlugStr(bookId: number, docId: number): string {
  return `${bookId}/${docId}`;
}

/** 自动生成 slug：英文/拼音 + 时间戳，中文名兜底纯时间戳 */
export function autoSlug(name: string): string {
  const ascii = name
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const ts = Date.now().toString(36);
  return ascii ? `${ascii.substring(0, 30)}-${ts}` : `repo-${ts}`;
}