import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
export async function loadDarkArts() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const darkArtEntry = resolve(__dirname, "../../dark-arts/index.mjs");
    if (!existsSync(darkArtEntry)) {
        return { tools: [], handlers: {} };
    }
    try {
        const mod = await import(darkArtEntry);
        return mod.getDarkArts();
    }
    catch (e) {
        console.error("[dark-arts] 加载失败:", e.message);
        return { tools: [], handlers: {} };
    }
}
//# sourceMappingURL=dark-arts-loader.js.map