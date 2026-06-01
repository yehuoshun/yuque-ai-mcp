import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface DarkArtsModule {
  getDarkArts: () => { tools: Tool[]; handlers: Record<string, (args: any) => Promise<string>> };
}

export async function loadDarkArts(): Promise<{
  tools: Tool[];
  handlers: Record<string, (args: any) => Promise<string>>;
}> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const darkArtEntry = resolve(__dirname, "../../dark-arts/index.mjs");

  if (!existsSync(darkArtEntry)) {
    return { tools: [], handlers: {} };
  }

  try {
    const mod: DarkArtsModule = await import(darkArtEntry);
    return mod.getDarkArts();
  } catch (e) {
    console.error("[dark-arts] 加载失败:", (e as Error).message);
    return { tools: [], handlers: {} };
  }
}
