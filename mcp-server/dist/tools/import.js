import { readFileSync, existsSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { post, put } from "../client.js";
import { loadConfig } from "../config.js";
// ===================== 扩展名 → 语言标记 =====================
const EXT_TO_LANG = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".java": "java", ".rb": "ruby", ".go": "go", ".rs": "rust",
    ".swift": "swift", ".cpp": "cpp", ".hpp": "cpp", ".c": "c", ".h": "c",
    ".cs": "csharp", ".php": "php", ".lua": "lua", ".scala": "scala",
    ".groovy": "groovy", ".kt": "kotlin", ".dart": "dart", ".m": "objectivec",
    ".mm": "objectivec", ".sql": "sql", ".sh": "bash", ".bash": "bash",
    ".zsh": "bash", ".ps1": "powershell", ".bat": "batch", ".cmd": "batch",
    ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss",
    ".less": "less", ".xml": "xml", ".svg": "xml",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".properties": "properties",
    ".env": "bash", ".csv": "csv", ".tsv": "tsv",
    ".rst": "rst", ".tex": "latex",
};
const TEXT_EXTS = new Set([".txt", ".log", ".nfo", ".diff", ".patch", ".md", ".markdown"]);
// ===================== Obsidian Markdown 适配 =====================
const CALLOUT_MAP = {
    note: "📝 Note",
    warning: "⚠️ Warning",
    tip: "💡 Tip",
    info: "ℹ️ Info",
    danger: "🚫 Danger",
    example: "📋 Example",
    quote: "💬 Quote",
    abstract: "📄 Abstract",
    todo: "✅ Todo",
    success: "✅ Success",
    question: "❓ Question",
    failure: "❌ Failure",
    bug: "🐛 Bug",
    check: "✅ Check",
};
/**
 * 对 Obsidian/非标准 Markdown 做正则适配：
 *   - 提取 frontmatter title
 *   - [[WikiLinks]] → 纯文本
 *   - ![[embed]] → ![](./embed)
 *   - callout > [!type] → > **emoji Type:**
 *   - %% 注释 %% → 删除
 *   - #tag → 删除
 */
function adaptMarkdown(md) {
    let body = md;
    let title;
    const imageRefs = [];
    // 1. YAML frontmatter: 提取 title，删除整个 frontmatter 块
    const fmMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (fmMatch) {
        const fm = fmMatch[1];
        const titleMatch = fm.match(/^title:\s*(.+)$/m);
        if (titleMatch)
            title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
        body = body.slice(fmMatch[0].length);
    }
    // 2. Obsidian 嵌入图片 ![[path]] → ![](./path)
    body = body.replace(/!\[\[([^\]]+)\]\]/g, (_m, p) => {
        const clean = p.split("|")[0].trim(); // 去掉 |width 等
        if (!/^https?:\/\//i.test(clean)) {
            imageRefs.push(clean);
        }
        return `![](${clean})`;
    });
    // 3. Obsidian WikiLinks [[Doc]] → Doc, [[Doc|Alias]] → Alias
    body = body.replace(/\[\[([^\]]+)\]\]/g, (_m, p) => {
        const parts = p.split("|");
        return parts.length > 1 ? parts[1].trim() : parts[0].trim();
    });
    // 4. Callouts: > [!type] ... → > **emoji Type:** ...
    body = body.replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (_m, type, rest) => {
        const label = CALLOUT_MAP[type.toLowerCase()] || `📌 ${type}`;
        return `> **${label}:**${rest}`;
    });
    // 5. 删除 %% 注释 %%（支持跨行）
    body = body.replace(/%%[\s\S]*?%%/g, "");
    // 6. 删除行内 #tag（不在代码块内、不在 URL 里）
    const lines = body.split("\n");
    let inCodeBlock = false;
    const cleaned = lines.map((line) => {
        if (/^```/.test(line))
            inCodeBlock = !inCodeBlock;
        if (inCodeBlock)
            return line;
        // 删除独立的 #tag（前后是空格、行首行尾或标点，不含 /
        return line.replace(/(^|\s)#([\w\u4e00-\u9fff-]+)(?=\s|$|[.,;:!?)\]》])/g, "$1$2");
    });
    body = cleaned.join("\n");
    // 7. 提取标准 Markdown 图片 ![](path) 中的本地路径
    const mdImgRe = /!\[.*?\]\(([^)]+)\)/g;
    let m;
    while ((m = mdImgRe.exec(body)) !== null) {
        const path = m[1];
        if (!/^https?:\/\//i.test(path) && !imageRefs.includes(path)) {
            imageRefs.push(path);
        }
    }
    return { body, title, imageRefs };
}
// ===================== 文件上传到 CDN =====================
async function uploadFile(filePath, cookie, ctoken, userId, type = "image") {
    try {
        const fileBuffer = readFileSync(filePath);
        const fileName = basename(filePath);
        const boundary = "----YuqueImport" + Date.now();
        const parts = [];
        const add = (s) => parts.push(Buffer.from(s, "utf-8"));
        add(`--${boundary}\r\n`);
        add(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
        add("Content-Type: application/octet-stream\r\n\r\n");
        parts.push(fileBuffer);
        add("\r\n");
        add(`--${boundary}--\r\n`);
        const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=${type}&ctoken=${ctoken}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Cookie: cookie,
                "x-csrf-token": ctoken,
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                Referer: "https://www.yuque.com/",
                Origin: "https://www.yuque.com",
                "User-Agent": "Mozilla/5.0",
            },
            body: Buffer.concat(parts),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return { success: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        const filekey = data?.data?.filekey || data?.filekey || "";
        const cdnUrl = filekey ? `https://cdn.nlark.com/${filekey}` : "";
        return cdnUrl ? { success: true, url: cdnUrl } : { success: false, error: "No filekey in response" };
    }
    catch (e) {
        return { success: false, error: e.message || String(e) };
    }
}
// ===================== 主入口 =====================
export async function importDoc(params) {
    const config = loadConfig();
    const filePath = params.file_path;
    const skipImages = params.skip_images || !config.cookie || !config.ctoken || !config.user_id;
    // 1. 检查文件
    if (!existsSync(filePath)) {
        return JSON.stringify({ error: "FILE_NOT_FOUND", message: `文件不存在: ${filePath}` });
    }
    const ext = extname(filePath).toLowerCase();
    const fileName = basename(filePath);
    let title = params.title || "";
    let body = params.body || "";
    let adapted = false;
    let imageRefs = [];
    if (params.body) {
        // === 模式 B：使用预适配 body ===
        adapted = true;
        // 仍然提取本地图片路径
        const mdImgRe = /!\[.*?\]\(([^)]+)\)/g;
        let m;
        while ((m = mdImgRe.exec(body)) !== null) {
            const p = m[1];
            if (!/^https?:\/\//i.test(p) && !imageRefs.includes(p)) {
                imageRefs.push(p);
            }
        }
        if (!title) {
            // 尝试从 body 中提取第一个 H1 作为标题
            const h1 = body.match(/^#\s+(.+)$/m);
            if (h1)
                title = h1[1].trim();
        }
    }
    else if (ext === ".md" || ext === ".markdown") {
        // === Markdown 文件：读文件 + regex 适配 ===
        const raw = readFileSync(filePath, "utf-8");
        const adapted_md = adaptMarkdown(raw);
        body = adapted_md.body;
        imageRefs = adapted_md.imageRefs;
        if (adapted_md.title && !title)
            title = adapted_md.title;
        adapted = body !== raw;
    }
    else {
        // === 代码/文本文件 ===
        const raw = readFileSync(filePath, "utf-8");
        const lang = EXT_TO_LANG[ext];
        if (lang) {
            body = "```" + lang + "\n" + raw + "\n```";
        }
        else {
            body = raw;
        }
        if (!title)
            title = fileName;
    }
    // 如果仍然没有标题，用文件名（去掉后缀）
    if (!title)
        title = fileName.replace(/\.[^.]+$/, "");
    // 2. 上传本地图片到 CDN
    const imageResults = [];
    if (!skipImages && imageRefs.length > 0) {
        const cookie = config.cookie;
        const ctoken = config.ctoken;
        const userId = config.user_id;
        const baseDir = dirname(resolve(filePath));
        for (const imgPath of imageRefs) {
            const fullPath = resolve(baseDir, imgPath);
            if (!existsSync(fullPath)) {
                imageResults.push({ path: imgPath, skipped: true, error: "文件不存在" });
                continue;
            }
            const result = await uploadFile(fullPath, cookie, ctoken, userId, "image");
            if (result.success && result.url) {
                imageResults.push({ path: imgPath, url: result.url, skipped: false });
                // 替换 body 中的本地路径为 CDN URL
                body = body.replace(imgPath, result.url);
            }
            else {
                imageResults.push({ path: imgPath, skipped: true, error: result.error });
            }
        }
    }
    else if (imageRefs.length > 0) {
        for (const imgPath of imageRefs) {
            imageResults.push({ path: imgPath, skipped: true, error: "无 Cookie，跳过上传" });
        }
    }
    // 3. 可选：上传原始文件作为附件
    let attachmentUrl = "";
    let attachmentWarning = "";
    if (params.upload_original && !skipImages) {
        try {
            const result = await uploadFile(filePath, config.cookie, config.ctoken, config.user_id, "attachment");
            if (result.success && result.url) {
                attachmentUrl = result.url;
                body += `\n\n---\n📎 原始文件：[${fileName}](${attachmentUrl})`;
            }
        }
        catch {
            attachmentWarning = "附件上传失败";
        }
    }
    // 4. 创建文档
    const { default_book } = config;
    const bookId = params.book_id || default_book.book_id;
    if (!bookId) {
        return JSON.stringify({ error: "NO_BOOK_ID", message: "未指定 book_id 且未配置 default_book" });
    }
    // 超过 500KB 截断
    const MAX_BYTES = 500 * 1024;
    const bodyBytes = Buffer.byteLength(body, "utf-8");
    let truncated = false;
    if (bodyBytes > MAX_BYTES) {
        const truncatedBody = Buffer.from(body.slice(0, MAX_BYTES)).toString("utf-8");
        body = truncatedBody + "\n\n---\n⚠️ 文件过大，已截断（原始大小 " + (bodyBytes / 1024).toFixed(0) + "KB）";
        truncated = true;
    }
    try {
        const data = await post(`/repos/${bookId}/docs`, {
            title,
            body,
            format: "markdown",
        });
        const doc = data.data || data;
        const docId = doc.id;
        // 自动挂载到目录（对齐官方：child + 空 target_uuid = 根级子节点）
        try {
            await put(`/repos/${bookId}/toc`, {
                action: "appendNode",
                action_mode: "child",
                target_uuid: "",
                type: "DOC",
                doc_ids: [docId],
            });
        }
        catch {
            // TOC 挂载失败不影响返回
        }
        const uploaded = imageResults.filter(r => !r.skipped).length;
        const skipped = imageResults.filter(r => r.skipped).length;
        return JSON.stringify({
            success: true,
            doc: { id: docId, title, slug: doc.slug },
            adapted,
            truncated,
            images: { uploaded, skipped, details: imageResults },
            warnings: [
                ...(truncated ? [`文件超过 500KB，已截断`] : []),
                ...(skipped > 0 && skipImages ? ["无 Cookie 登录态，已跳过所有图片上传"] : []),
                ...(attachmentWarning ? [attachmentWarning] : []),
            ],
        }, null, 2);
    }
    catch (e) {
        return JSON.stringify({
            error: "CREATE_DOC_FAILED",
            message: e.message || String(e),
            adapted,
            images: imageResults,
        }, null, 2);
    }
}
//# sourceMappingURL=import.js.map