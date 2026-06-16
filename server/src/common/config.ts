/**
 * config — 读取 config/config.json
 *
 * 所有工具模块通过此文件获取配置，不再依赖环境变量。
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RssSourceConfig {
  book_id?: string;
  namespace?: string;
  id?: number;
  enable_kv?: boolean;
}

interface RssConfig {
  default_repo?: RssSourceConfig;
  [source: string]: RssSourceConfig | undefined;
}

interface KvConfig {
  default_repo?: RssSourceConfig;
  [source: string]: RssSourceConfig | undefined;
}

interface Config {
  token: string;
  api_base: string;
  membership?: "pro" | "super";
  cookie?: string;
  ctoken?: string;
  rss?: RssConfig;
  kv?: KvConfig;
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
