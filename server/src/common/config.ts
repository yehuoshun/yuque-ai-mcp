/**
 * config — 读取 config/config.json
 *
 * 所有工具模块通过此文件获取配置，不再依赖环境变量。
 *
 * slug 格式：`{book_id}/{doc_id}`，用 / 分割解析。
 * kv_slugs / schedule_slugs 均为数组，支持多文档。
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface NamespaceConfig {
  book_id: number[];          // 目标知识库 ID 数组，最后一个为当前活跃仓库（满了就新增追加）
  kv_slugs?: string[];        // 去重 KV：`{book_id}/{doc_id}` 数组
  schedule_slugs?: string[];   // 定时策略：`{book_id}/{doc_id}` 数组
}

interface RssConfig {
  enabled: boolean;
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

  const configPath = resolve(__dirname, "../../../config/config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    _config = JSON.parse(raw) as Config;
  } catch {
    throw new Error(
      `无法读取 config/config.json。请复制 config/config.example.json 为 config/config.json 并填入 Token。`
    );
  }

  if (!_config.token || _config.token === "在此填入语雀 API Token") {
    throw new Error("请在 config/config.json 中填入有效的语雀 API Token / Please fill in a valid Yuque API Token in config/config.json");
  }

  _config.api_base = _config.api_base || "https://www.yuque.com/api/v2";
  return _config;
}

/** 持久化 config 到文件 */
export function saveConfig(): void {
  if (!_config) return;
  const configPath = resolve(__dirname, "../../../config/config.json");
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