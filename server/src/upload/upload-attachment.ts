/**
 * upload/attachment — 上传文件到语雀 CDN
 *
 * 端点：POST /api/upload/attach（Web API，Cookie 认证）
 * 职责：上传图片/附件/视频到语雀 CDN，返回 CDN URL
 *
 * 上限（超级会员）：图片 50MB / 附件 2GB / 视频 2GB
 * 失败自动重试一次，再失败报错
 */

import { readFileSync, statSync } from "fs";
import type { McpTool } from "../common/types.js";
import { loadConfig } from "../common/config.js";
import { requiredString } from "../common/validate.js";
import { apiGet, isErrorResult, fetchWithRetry } from "../common/api-client.js";

const LIMITS: Record<string, { max: number; label: string }> = {
  image: { max: 50, label: "50MB" },
  attachment: { max: 2048, label: "2GB" },
  video: { max: 2048, label: "2GB" },
};

/**
 * 语雀官方《支持插入的附件格式》白名单
 * 文档: https://www.yuque.com/yuque/gpvawt/ca13hg
 * - 基础格式：所有用户可用
 * - 会员额外格式：会员可用（zip/mp4/rar/7z 等）
 * - 压缩包家族：zip/gz/rar/7z/tar 单独放行 —— 官方文档未完整覆盖（gz/tar 不在清单），
 *   但实测语雀对压缩包是放行的（zip/gz 均上传成功），避免文档滞后误伤
 */
const BASE_EXTENSIONS = [
  "png", "jpeg", "svg", "pdf", "jpg", "gif", "webp", "docx", "xlsx", "pptx",
  "sketch", "doc", "rp", "xls", "xmind", "txt", "psd", "mp3", "sql", "ppt",
  "js", "key", "md", "css", "json", "java", "xml", "csv", "py", "yaml",
  "bmp", "sh", "wav", "xlsm", "numbers", "mmap", "yml", "markdown", "pages",
  "log", "ipynb", "jmx", "php", "ts", "bat", "m", "c", "go", "r", "cpp",
  "h", "mindnode", "keynote", "heif", "heic",
];
const MEMBER_EXTENSIONS = [
  "zip", "mp4", "rar", "html", "7z", "ai", "tif", "mov", "m4a", "rplib",
  "wmv", "avi", "xd", "flv", "chm", "mm", "graffle", "tiff", "wps", "rtf",
  "aac", "dart", "jsp", "xltx", "cs", "dotx", "pl", "potx", "reg", "tsx",
  "proto", "sgml", "cpt", "ass", "patch", "xlt", "xsd", "jsx", "ps1", "lua",
  "pas", "htm", "tex", "config", "cmake", "rb", "cmd", "scss", "less", "xhtml",
  "ppsx", "shtml", "cc", "coffee", "groovy", "rmvb", "d", "opml", "scala",
  "svn-base", "hpp", "rdf", "p", "wsdl", "bash", "el", "tpl", "diff", "asp",
  "asc", "inf", "dot", "ddl", "cls", "tmpl", "lst", "ahk", "asm", "make",
  "pm", "vi", "vim", "s", "abap", "tld", "bib", "script", "pot", "pps",
  "wpt", "asf", "m3u8", "mpg", "rm", "ada", "adp", "as", "as3", "ascx",
  "awk", "bash_login", "bash_logout", "bash_profile", "bashrc", "bsh", "build",
  "builder", "c++", "capfile", "cfc", "cfm", "cfml", "cl", "clj", "cpy",
  "cshtml", "cson", "csproj", "ctp", "cxx", "di", "disco", "dml", "dtd",
  "dtml", "emakefile", "erb", "erl", "f", "f90", "f95", "fs", "fsi",
  "fsscript", "fsx", "gemfile", "gemspec", "gitconfig", "gvy", "h++", "haml",
  "handlebars", "hbs", "hcp", "hh", "hrl", "hs", "htc", "hxx", "idl", "iim",
  "inc", "inl", "ipp", "irbrc", "jade", "jav", "l", "lhs", "lisp", "ltx",
  "mak", "makefile", "manifest", "markdn", "master", "mdown", "mkdn", "ml",
  "mli", "mll", "mly", "mud", "nfo", "osascript", "perl", "php2", "php3",
  "php4", "php5", "phtml", "plx", "pod", "pp", "profile", "ps1xml", "psd1",
  "psm1", "pss", "pt", "pug", "pyw", "rake", "rbx", "rc", "re", "rest",
  "resw", "resx", "rhtml", "rjs", "rprofile", "rpy", "rs", "rss", "rst",
  "ruby", "rxml", "sass", "scm", "sconscript", "sconstruct", "sml", "sty",
  "swift", "tcl", "textile", "tli", "vb", "vmg", "webpart", "wsp", "xoml",
  "xslt", "yaws", "zsh", "qt", "flac", "dat", "mkv", "swf", "m4v", "webm",
  "mpeg", "mts", "3gp", "f4v", "dv", "m2t", "mj2", "mjpeg", "mpe", "ogg",
  "vob",
];
const ARCHIVE_EXTENSIONS = ["zip", "gz", "rar", "7z", "tar"];
const ALLOWED_EXTENSIONS = new Set([
  ...BASE_EXTENSIONS,
  ...MEMBER_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
]);

/** 扩展名预检：返回不支持的扩展名（无扩展名/白名单内返回 null） */
function checkExtension(fileName: string): string | null {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return null;
  const ext = fileName.slice(idx + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) ? null : ext;
}

async function doUpload(
  filePath: string,
  fileName: string,
  fileBuffer: Buffer,
  type: string,
  userId: string,
  cookie: string,
  ctoken: string,
): Promise<{ ok: boolean; result: Record<string, unknown> }> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(fileBuffer)]), fileName);

  const url = `https://www.yuque.com/api/upload/attach?attachable_type=User&attachable_id=${userId}&type=${type}&ctoken=${ctoken}`;

  try {
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": ctoken,
        Referer: "https://www.yuque.com/",
        Origin: "https://www.yuque.com",
        "User-Agent": "Mozilla/5.0",
      },
      body: form,
    }, `Upload: ${fileName}`);

    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        result: { error: "UPLOAD_FAILED", status: res.status, message: text.slice(0, 200) },
      };
    }

    const data = JSON.parse(text) as { data?: { filekey?: string; extname?: string }; filekey?: string };
    const filekey = data?.data?.filekey || data?.filekey || "";
    const extname = data?.data?.extname || "";
    const urlResult = filekey ? `https://cdn.nlark.com/${filekey}` : "";

    return {
      ok: true,
      result: { success: true, url: urlResult, filekey, extname, type },
    };
  } catch (err) {
    return {
      ok: false,
      result: { error: "NETWORK_ERROR", message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export const uploadAttachment: McpTool = {
  name: "yuque_upload_attachment",
  description: "Upload a file to Yuque CDN (image≤50MB, attachment/video≤2GB, requires cookie+ctoken). Extension pre-check: only Yuque-supported formats allowed (official list: https://www.yuque.com/yuque/gpvawt/ca13hg), unsupported extensions rejected with a friendly error (pack into zip first). POST /upload/attach. 详见 references/api/upload_api.md",

  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Local file path (required)" },
      type: { type: "string", description: "File type: image, attachment, video, default attachment" },
      user_id: { type: "string", description: "User ID, auto-detected from token if omitted" },
    },
    required: ["file_path"],
  },

  async handler(args) {
    // @validate
    const __v = requiredString(args?.file_path, "file_path");
    if (__v) return __v;
    const cfg = loadConfig();
    const filePath = args?.file_path as string;
    const type = (args?.type as string) || "attachment";
    const cookie = cfg.cookie || "";
    const ctoken = cfg.ctoken || "";

    if (!cookie || !ctoken) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "MISSING_COOKIE",
                message:
                  "文件上传需要 Cookie 登录态，请在 config/config.json 中配置 cookie 和 ctoken 字段 / File upload requires Cookie auth. Please configure cookie and ctoken in config/config.json." +
                  "获取方式：浏览器打开 yuque.com 登录 → F12 → Application → Cookies → 复制 _yuque_session 和 yuque_ctoken",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 扩展名预检（本地拦截，不浪费网络请求）
    const preFileName = filePath.split("/").pop() || "file";
    const badExt = checkExtension(preFileName);
    if (badExt) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "EXT_NOT_ALLOWED",
                message: `语雀不支持 .${badExt} 扩展名，请打包成 zip 后上传 / Extension .${badExt} is not in Yuque's supported list, please pack it into a zip and retry`,
                file: preFileName,
                reference: "https://www.yuque.com/yuque/gpvawt/ca13hg",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 读取文件
    let fileBuffer: Buffer;
    let fileName: string;
    try {
      fileBuffer = readFileSync(filePath);
      fileName = filePath.split("/").pop() || "file";
      const sizeMB = statSync(filePath).size / 1024 / 1024;
      const limit = LIMITS[type] || LIMITS.attachment;
      if (sizeMB > limit.max) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: "FILE_TOO_LARGE",
                  message: `${type} 文件过大 (${sizeMB.toFixed(1)}MB)，${type} 上限 ${limit.label}`,
                  path: filePath,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    } catch (e: unknown) {
      const err = e as Error;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "FILE_NOT_FOUND",
                message: `文件不存在或无法读取: ${filePath}`,
                detail: err.message,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 获取 user_id：传了直接用，没传自动获取
    let userId = (args?.user_id as string) || "";
    if (!userId) {
      try {
        const userData = await apiGet("/user", undefined, "Get user for upload");
        if (!isErrorResult(userData)) {
          userId = String((userData as { data: { id: number } }).data.id);
        }
      } catch {
        // 获取失败，继续用空字符串尝试
      }
    }

    // 上传 + 失败重试一次
    let lastResult: { ok: boolean; result: Record<string, unknown> };
    for (let attempt = 0; attempt < 2; attempt++) {
      lastResult = await doUpload(filePath, fileName, fileBuffer, type, userId, cookie, ctoken);
      if (lastResult.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(lastResult.result, null, 2) }],
        };
      }
    }

    // 两次都失败
    return {
      content: [{ type: "text" as const, text: JSON.stringify(lastResult!.result, null, 2) }],
      isError: true,
    };
  },
};
