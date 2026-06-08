import { readFileSync, existsSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveConfigPath() {
    if (process.env.YUQUE_CONFIG_PATH) {
        return process.env.YUQUE_CONFIG_PATH;
    }
    return resolve(__dirname, "../../config/yuque-config.json");
}
let cached = null;
let lastMtimeMs = 0;
let configFilePath = "";
export function getConfigPath() {
    return configFilePath || resolveConfigPath();
}
export function reloadConfig(force = true) {
    if (force) {
        cached = null;
        lastMtimeMs = 0;
    }
    return loadConfig();
}
export function loadConfig() {
    // 环境变量模式：env 不变，缓存有效
    if (cached && process.env.YUQUE_TOKEN)
        return cached;
    if (process.env.YUQUE_TOKEN) {
        let cookie = process.env.YUQUE_COOKIE || undefined;
        let ctoken = process.env.YUQUE_CTOKEN || undefined;
        let fileUserId;
        if (!cookie || !ctoken) {
            try {
                const configPath = resolveConfigPath();
                if (existsSync(configPath)) {
                    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
                    if (!cookie)
                        cookie = raw.cookie;
                    if (!ctoken)
                        ctoken = raw.ctoken;
                    if (!fileUserId)
                        fileUserId = raw.user_id;
                }
            }
            catch { /* ignore */ }
        }
        cached = {
            token: process.env.YUQUE_TOKEN,
            group: process.env.YUQUE_GROUP || "",
            cookie,
            ctoken,
            user_id: process.env.YUQUE_USER_ID || fileUserId || undefined,
        };
        return cached;
    }
    // 配置文件模式
    const configPath = resolveConfigPath();
    configFilePath = configPath;
    try {
        const stat = statSync(configPath);
        if (cached && stat.mtimeMs === lastMtimeMs)
            return cached;
        lastMtimeMs = stat.mtimeMs;
    }
    catch {
        // 文件不存在，继续往下抛错
    }
    if (!existsSync(configPath)) {
        throw new Error(`语雀配置缺失。请设置环境变量 YUQUE_TOKEN 和 YUQUE_GROUP，或创建 ${configPath}`);
    }
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    cached = {
        token: raw.token || "",
        group: raw.group || "",
        cookie: raw.cookie || undefined,
        ctoken: raw.ctoken || undefined,
        user_id: raw.user_id || undefined,
    };
    if (!cached.token || !cached.group) {
        throw new Error("config/yuque-config.json 缺少 token 或 group");
    }
    return cached;
}
//# sourceMappingURL=config.js.map