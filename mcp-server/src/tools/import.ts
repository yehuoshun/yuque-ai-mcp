import { readFileSync, existsSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { post, put } from "../client.js";
import { loadConfig } from "../config.js";
import * as XLSX from "xlsx";

// ===================== 扩展名 → 语言标记 =====================

const EXT_TO_LANG: Record<string, string> = {
  // Python
  ".py": "python", ".pyw": "python",
  // JavaScript / TypeScript
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript",
  ".coffee": "coffeescript",
  // JVM
  ".java": "java", ".jsp": "java", ".jav": "java",
  ".kt": "kotlin", ".scala": "scala", ".groovy": "groovy", ".clj": "clojure",
  // C / C++ / ObjC
  ".c": "c", ".h": "c",
  ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".c++": "cpp",
  ".h++": "cpp", ".hh": "cpp", ".hxx": "cpp", ".inl": "cpp", ".ipp": "cpp",
  ".m": "objectivec", ".mm": "objectivec",
  // C# / .NET
  ".cs": "csharp", ".vb": "vb", ".asp": "asp", ".aspx": "asp", ".ascx": "asp",
  // Go / Rust / Swift / Dart
  ".go": "go", ".rs": "rust", ".swift": "swift", ".dart": "dart",
  // Ruby
  ".rb": "ruby", ".rbx": "ruby", ".rake": "ruby",
  // PHP
  ".php": "php", ".php2": "php", ".php3": "php", ".php4": "php", ".php5": "php",
  ".phtml": "php",
  // Lua
  ".lua": "lua",
  // Perl
  ".pl": "perl", ".perl": "perl", ".pm": "perl",
  // Shell
  ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".bashrc": "bash",
  ".bash_login": "bash", ".bash_logout": "bash", ".bash_profile": "bash",
  // PowerShell
  ".ps1": "powershell", ".psm1": "powershell", ".psd1": "powershell",
  ".ps1xml": "powershell",
  // Batch
  ".bat": "batch", ".cmd": "batch",
  // SQL
  ".sql": "sql", ".ddl": "sql", ".dml": "sql",
  // R
  ".r": "r",
  // Pascal
  ".pas": "pascal",
  // Assembly
  ".asm": "assembly", ".s": "assembly",
  // AutoHotkey
  ".ahk": "autohotkey",
  // Tcl
  ".tcl": "tcl",
  // Erlang
  ".erl": "erlang", ".hrl": "erlang",
  // Haskell
  ".hs": "haskell", ".lhs": "haskell",
  // OCaml
  ".ml": "ocaml", ".mli": "ocaml", ".mll": "ocaml", ".mly": "ocaml",
  // F# / Fortran
  ".fs": "fsharp", ".fsi": "fsharp", ".fsx": "fsharp", ".fsscript": "fsharp",
  ".f": "fortran", ".f90": "fortran", ".f95": "fortran",
  // Lisp
  ".lisp": "lisp", ".lsp": "lisp", ".l": "lisp", ".cl": "lisp",
  // Protobuf
  ".proto": "protobuf",
  // Make / Build
  ".make": "makefile", ".mak": "makefile", ".makefile": "makefile",
  ".cmake": "cmake",
  // Web
  ".html": "html", ".htm": "html", ".xhtml": "html", ".shtml": "html",
  ".css": "css", ".scss": "scss", ".less": "less", ".sass": "sass",
  // Template
  ".jade": "pug", ".pug": "pug",
  ".haml": "haml",
  ".handlebars": "handlebars", ".hbs": "handlebars",
  ".erb": "erb", ".rhtml": "erb",
  // XML family
  ".xml": "xml", ".svg": "xml", ".rss": "xml", ".atom": "xml",
  ".xsd": "xml", ".wsdl": "xml", ".dtd": "xml", ".sgml": "xml",
  ".opml": "xml", ".rdf": "xml", ".tld": "xml", ".xoml": "xml",
  ".xslt": "xml", ".csproj": "xml", ".resx": "xml", ".resw": "xml",
  ".manifest": "xml", ".disco": "xml",
  // Data / Config
  ".json": "json", ".cson": "json",
  ".yaml": "yaml", ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini", ".cfg": "ini", ".conf": "ini", ".config": "ini", ".reg": "ini",
  ".properties": "properties",
  ".env": "bash",
  ".csv": "csv", ".tsv": "tsv",
  // Document markup
  ".rst": "rst",
  ".tex": "latex", ".ltx": "latex", ".sty": "latex",
  ".textile": "textile",
  // Misc
  ".profile": "bash", ".gitconfig": "ini",
  ".gemfile": "ruby", ".gemspec": "ruby",
  ".capfile": "ruby", ".irbrc": "ruby", ".rprofile": "ruby", ".rxml": "ruby",
};

const TEXT_EXTS = new Set([".txt", ".log", ".nfo", ".diff", ".patch", ".md", ".markdown", ".markdn", ".mdown", ".mkdn", ".textile"]);

// 图片 → 上传 CDN 嵌入文档
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".tiff", ".tif"]);

// Excel → 解析为 Markdown 表格
const EXCEL_EXTS = new Set([".xlsx", ".xls"]);

// 暂不支持转换但可上传为附件的文档格式
// （上传为附件 → 创建文档含下载链接，如需内容转换需外部工具 pandoc/pdftotext）
const UNSUPPORTED_EXTS = new Set<string>([]);

// 语雀支持上传的文件扩展名（不在 EXT_TO_LANG/IMAGE_EXTS/TEXT_EXTS 中的）
// 来源：语雀上传接口实测 + 官方文档，未知扩展名上传会失败
const UPLOAD_EXTS = new Set([
  // 视频
  "mp4", "mov", "m4v", "wmv", "avi", "flv", "rmvb", "rm", "mkv", "swf",
  "webm", "mpeg", "mpg", "mts", "3gp", "f4v", "dv", "m2t", "mj2", "mjpeg",
  "mpe", "ogg", "vob", "qt", "asf", "m3u8",
  // 音频
  "aac", "flac", "m4a", "mp3", "wav", "wma",
  // 压缩包
  "zip", "rar", "7z", "gz", "tar", "bz2", "xz",
  // 文档（仅上传附件，不提取内容）
  "pdf", "docx", "doc", "pptx", "ppt",
  "odt", "ods", "odp", "rtf", "wps", "chm",
  // 设计稿
  "ai", "xd", "sketch", "graffle", "psd", "cpt",
  // 其他二进制
  "rplib", "dat",
].map(e => "." + e));

// ===================== Excel → Markdown 表格 =====================

function excelToMarkdown(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rows.length === 0) {
      parts.push(`## ${sheetName}\n\n（空表）\n`);
      continue;
    }

    // 超过 500 行截断
    const maxRows = 500;
    const truncated = rows.length > maxRows;
    const data = rows.slice(0, maxRows);

    // 计算列数（取最大行宽）
    const colCount = Math.max(...data.map(r => Array.isArray(r) ? r.length : 1));

    // 标题行
    const header = data[0] as any[];
    let md = `## ${sheetName}\n\n`;
    md += "| " + Array.from({ length: colCount }, (_, i) => String(header[i] ?? `列${i + 1}`)).join(" | ") + " |\n";
    md += "| " + Array.from({ length: colCount }, () => "---").join(" | ") + " |\n";

    // 数据行
    for (let r = 1; r < data.length; r++) {
      const row = data[r] as any[];
      md += "| " + Array.from({ length: colCount }, (_, i) => {
        const cell = String(row[i] ?? "");
        // 转义管道符
        return cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
      }).join(" | ") + " |\n";
    }

    if (truncated) {
      md += `\n⚠️ 表格超过 500 行，已截断（原始 ${rows.length} 行）\n`;
    }

    parts.push(md);
  }

  return parts.join("\n\n");
}

const CALLOUT_MAP: Record<string, string> = {
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

interface AdaptResult {
  body: string;
  title?: string;
  imageRefs: string[];  // local image paths found
}

/**
 * 对 Obsidian/非标准 Markdown 做正则适配：
 *   - 提取 frontmatter title
 *   - [[WikiLinks]] → 纯文本
 *   - ![[embed]] → ![](./embed)
 *   - callout > [!type] → > **emoji Type:**
 *   - %% 注释 %% → 删除
 *   - #tag → 删除
 */
function adaptMarkdown(md: string): AdaptResult {
  let body = md;
  let title: string | undefined;
  const imageRefs: string[] = [];

  // 1. YAML frontmatter: 提取 title，删除整个 frontmatter 块
  const fmMatch = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const titleMatch = fm.match(/^title:\s*(.+)$/m);
    if (titleMatch) title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
    body = body.slice(fmMatch[0].length);
  }

  // 2. Obsidian 嵌入图片 ![[path]] → ![](./path)
  body = body.replace(/!\[\[([^\]]+)\]\]/g, (_m, p: string) => {
    const clean = p.split("|")[0].trim(); // 去掉 |width 等
    if (!/^https?:\/\//i.test(clean)) {
      imageRefs.push(clean);
    }
    return `![](${clean})`;
  });

  // 3. Obsidian WikiLinks [[Doc]] → Doc, [[Doc|Alias]] → Alias
  body = body.replace(/\[\[([^\]]+)\]\]/g, (_m, p: string) => {
    const parts = p.split("|");
    return parts.length > 1 ? parts[1].trim() : parts[0].trim();
  });

  // 4. Callouts: > [!type] ... → > **emoji Type:** ...
  body = body.replace(/^>\s*\[!(\w+)\]\s*(.*)$/gm, (_m, type: string, rest: string) => {
    const label = CALLOUT_MAP[type.toLowerCase()] || `📌 ${type}`;
    return `> **${label}:**${rest}`;
  });

  // 5. 删除 %% 注释 %%（支持跨行）
  body = body.replace(/%%[\s\S]*?%%/g, "");

  // 6. 删除行内 #tag（不在代码块内、不在 URL 里）
  const lines = body.split("\n");
  let inCodeBlock = false;
  const cleaned = lines.map((line) => {
    if (/^```/.test(line)) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) return line;
    // 删除独立的 #tag（前后是空格、行首行尾或标点，不含 /
    return line.replace(/(^|\s)#([\w\u4e00-\u9fff-]+)(?=\s|$|[.,;:!?)\]》])/g, "$1$2");
  });
  body = cleaned.join("\n");

  // 7. 提取标准 Markdown 图片 ![](path) 中的本地路径
  const mdImgRe = /!\[.*?\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImgRe.exec(body)) !== null) {
    const path = m[1];
    if (!/^https?:\/\//i.test(path) && !imageRefs.includes(path)) {
      imageRefs.push(path);
    }
  }

  return { body, title, imageRefs };
}

// ===================== 文件上传到 CDN =====================

async function uploadFile(
  filePath: string,
  cookie: string,
  ctoken: string,
  userId: string,
  type: "image" | "attachment" = "image",
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);
    const boundary = "----YuqueImport" + Date.now();
    const parts: Buffer[] = [];
    const add = (s: string) => parts.push(Buffer.from(s, "utf-8"));

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
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

    const data: any = await res.json();
    const filekey = data?.data?.filekey || data?.filekey || "";
    const cdnUrl = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return cdnUrl ? { success: true, url: cdnUrl } : { success: false, error: "No filekey in response" };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

// ===================== 主入口 =====================

export async function importDoc(params: {
  file_path: string;
  book_id?: number;
  body?: string;          // 预适配好的 body，跳过文件读取和 regex 适配
  title?: string;         // 覆盖标题
  skip_images?: boolean;  // 跳过图片上传（无 cookie 时自动跳过）
  upload_original?: boolean; // 上传原始文件作为附件（代码/文本文件）
}): Promise<string> {
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
  let imageRefs: string[] = [];

  if (params.body) {
    // === 模式 B：使用预适配 body ===
    adapted = true;
    // 仍然提取本地图片路径
    const mdImgRe = /!\[.*?\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdImgRe.exec(body)) !== null) {
      const p = m[1];
      if (!/^https?:\/\//i.test(p) && !imageRefs.includes(p)) {
        imageRefs.push(p);
      }
    }
    if (!title) {
      // 尝试从 body 中提取第一个 H1 作为标题
      const h1 = body.match(/^#\s+(.+)$/m);
      if (h1) title = h1[1].trim();
    }
  } else if (ext === ".md" || ext === ".markdown") {
    // === Markdown 文件：读文件 + regex 适配 ===
    const raw = readFileSync(filePath, "utf-8");
    const adapted_md = adaptMarkdown(raw);
    body = adapted_md.body;
    imageRefs = adapted_md.imageRefs;
    if (adapted_md.title && !title) title = adapted_md.title;
    adapted = body !== raw;
  } else if (EXCEL_EXTS.has(ext)) {
    // === Excel 文件：解析为 Markdown 表格 → 创建文档 ===
    if (!title) title = fileName.replace(/\.[^.]+$/, "");
    try {
      body = excelToMarkdown(filePath);
    } catch (e: any) {
      return JSON.stringify({
        error: "EXCEL_PARSE_FAILED",
        message: `Excel 解析失败: ${e.message || e}`,
      });
    }
  } else if (IMAGE_EXTS.has(ext)) {
    // === 图片文件：上传 CDN → 创建文档（嵌入图片） ===
    if (skipImages) {
      return JSON.stringify({
        error: "NO_COOKIE",
        message: "图片导入需要 Cookie 登录态。请在 config 中配置 cookie 和 ctoken。",
      });
    }
    const upResult = await uploadFile(filePath, config.cookie!, config.ctoken!, config.user_id!, "image");
    if (!upResult.success || !upResult.url) {
      return JSON.stringify({
        error: "UPLOAD_FAILED",
        message: `图片上传失败: ${upResult.error}`,
      });
    }
    if (!title) title = fileName;
    body = `![](${upResult.url})`;
  } else if (UNSUPPORTED_EXTS.has(ext)) {
    // === 暂不支持的文件类型 ===
    return JSON.stringify({
      error: "UNSUPPORTED_FORMAT",
      message: `暂不支持 ${ext} 格式导入。支持的类型：Markdown、代码、文本、图片、通用附件。${ext} 需要外部工具（pandoc/pdftotext）转换。`,
    });
  } else if (EXT_TO_LANG[ext] || TEXT_EXTS.has(ext)) {
    // === 代码/文本文件 ===
    const raw = readFileSync(filePath, "utf-8");
    const lang = EXT_TO_LANG[ext];
    if (lang) {
      body = "```" + lang + "\n" + raw + "\n```";
    } else {
      body = raw;
    }
    if (!title) title = fileName;
  } else {
    // === 未知类型：尝试读为文本，失败则上传附件 ===
    try {
      const raw = readFileSync(filePath, "utf-8");
      // 检测是否为有效文本（无 null 字节）
      if (raw.includes("\0")) throw new Error("binary");
      body = raw;
      if (!title) title = fileName;
    } catch {
      // 非文本文件 → 检查是否语雀支持上传
      if (!UPLOAD_EXTS.has(ext)) {
        return JSON.stringify({
          error: "UNSUPPORTED_EXTENSION",
          message: `语雀不支持上传 ${ext} 格式。建议将文件打包为 .zip 后重新导入。`,
        });
      }
      // 语雀支持的格式 → 上传附件
      if (skipImages) {
        return JSON.stringify({
          error: "NO_COOKIE",
          message: `无法识别文件类型 ${ext}，且无 Cookie 无法上传为附件。`,
        });
      }
      const upResult = await uploadFile(filePath, config.cookie!, config.ctoken!, config.user_id!, "attachment");
      if (!upResult.success || !upResult.url) {
        return JSON.stringify({
          error: "UPLOAD_FAILED",
          message: `附件上传失败: ${upResult.error}`,
        });
      }
      if (!title) title = fileName;
      body = `📎 [${fileName}](${upResult.url})`;
    }
  }

  // 如果仍然没有标题，用文件名（去掉后缀）
  if (!title) title = fileName.replace(/\.[^.]+$/, "");

  // 2. 上传本地图片到 CDN
  const imageResults: { path: string; url?: string; skipped: boolean; error?: string }[] = [];
  if (!skipImages && imageRefs.length > 0) {
    const cookie = config.cookie!;
    const ctoken = config.ctoken!;
    const userId = config.user_id!;
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
      } else {
        imageResults.push({ path: imgPath, skipped: true, error: result.error });
      }
    }
  } else if (imageRefs.length > 0) {
    for (const imgPath of imageRefs) {
      imageResults.push({ path: imgPath, skipped: true, error: "无 Cookie，跳过上传" });
    }
  }

  // 3. 可选：上传原始文件作为附件
  let attachmentUrl = "";
  let attachmentWarning = "";
  if (params.upload_original && !skipImages) {
    try {
      const result = await uploadFile(filePath, config.cookie!, config.ctoken!, config.user_id!, "attachment");
      if (result.success && result.url) {
        attachmentUrl = result.url;
        body += `\n\n---\n📎 原始文件：[${fileName}](${attachmentUrl})`;
      }
    } catch {
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
    const doc = (data as any).data || data;
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
    } catch {
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
  } catch (e: any) {
    return JSON.stringify({
      error: "CREATE_DOC_FAILED",
      message: e.message || String(e),
      adapted,
      images: imageResults,
    }, null, 2);
  }
}