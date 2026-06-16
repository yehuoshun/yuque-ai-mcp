import * as cheerio from "cheerio";
import crypto from "crypto";
import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { apiPost, apiPut, apiDelete, isErrorResult } from "../common/api-client.js";

// 从 save.ts 复用
function resolveRepo(source?: string, paramRepo?: string): string {
  const cfg = loadConfig();
  if (paramRepo) return paramRepo;
  if (source && cfg.crawler?.sources?.[source]?.id) {
    return String(cfg.crawler.sources[source].id);
  }
  if (cfg.crawler?.default_repo?.id) return String(cfg.crawler.default_repo.id);
  return "";
}

function buildSlug(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex").substring(0, 12);
}

let nodeIdCounter = 0;
function nextId(): string {
  return "u" + (++nodeIdCounter).toString(36);
}

/**
 * HTML → 语雀 Lake 格式
 * 输出完整的 Lake HTML（<div class="lake-content">...</div>）
 */
function htmlToLake(html: string, sourceUrl: string, title: string): string {
  const $ = cheerio.load(html);
  nodeIdCounter = 0;

  // 1. 清理
  $("script, style, noscript").remove();

  // 2. 处理 data-src
  $("img[data-src]").each((_, el) => {
    const dataSrc = $(el).attr("data-src");
    if (dataSrc) $(el).attr("src", dataSrc);
  });

  // 3. 递归转换
  function convert(node: cheerio.Cheerio<any>): string {
    let result = "";

    node.contents().each((_, child) => {
      if (child.type === "text") {
        const text = $(child).text();
        if (text.trim()) {
          result += `<span class="ne-text">${escapeLake(text)}</span>`;
        } else {
          result += text;
        }
        return;
      }

      if (child.type !== "tag") return;

      const tag = child.tagName?.toLowerCase();
      const $el = $(child);

      switch (tag) {
        case "h1": result += `<h1 id="${nextId()}">${convert($el)}</h1>`; break;
        case "h2": result += `<h2 id="${nextId()}">${convert($el)}</h2>`; break;
        case "h3": result += `<h3 id="${nextId()}">${convert($el)}</h3>`; break;
        case "h4": result += `<h4 id="${nextId()}">${convert($el)}</h4>`; break;
        case "h5": result += `<h5 id="${nextId()}">${convert($el)}</h5>`; break;
        case "h6": result += `<h6 id="${nextId()}">${convert($el)}</h6>`; break;

        case "p":
          result += `<p id="${nextId()}" class="ne-p">${convert($el)}</p>`;
          break;

        case "br":
          result += "<br/>";
          break;

        case "strong":
        case "b":
          result += `<strong>${convert($el)}</strong>`;
          break;

        case "em":
        case "i":
          result += `<em>${convert($el)}</em>`;
          break;

        case "del":
        case "s":
        case "strike":
          result += `<s>${convert($el)}</s>`;
          break;

        case "a": {
          const href = $el.attr("href") || "";
          const text = convert($el) || href;
          result += `<a href="${escapeAttr(href)}">${text}</a>`;
          break;
        }

        case "img": {
          const src = $el.attr("src") || $el.attr("data-src") || "";
          const alt = $el.attr("alt") || "";
          result += `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"/>`;
          break;
        }

        case "code": {
          const parentTag = $el.parent().get(0)?.tagName?.toLowerCase();
          if (parentTag === "pre") return; // 由 pre 统一处理
          result += `<code>${escapeLake($el.text())}</code>`;
          break;
        }

        case "pre": {
          const codeEl = $el.find("code");
          const code = codeEl.length ? codeEl.text() : $el.text();
          let lang = "plain";
          if (codeEl.length) {
            const cls = codeEl.attr("class") || "";
            const m = cls.match(/language-(\w+)/);
            if (m) lang = m[1];
          }
          result += `<pre data-language="${lang}" id="${nextId()}" class="ne-codeblock language-${lang}"><code>${escapeLake(code)}</code></pre>`;
          break;
        }

        case "blockquote":
          result += `<blockquote id="${nextId()}">${convert($el)}</blockquote>`;
          break;

        case "ul":
          result += `<ul id="${nextId()}">${convert($el)}</ul>`;
          break;

        case "ol":
          result += `<ol id="${nextId()}">${convert($el)}</ol>`;
          break;

        case "li":
          result += `<li id="${nextId()}">${convert($el)}</li>`;
          break;

        case "table": {
          result += `<table>`;
          let isHeader = true;
          $el.find("tr").each((_, tr) => {
            result += "<tr>";
            $(tr).find("th, td").each((__, td) => {
              const cellTag = $(td).prop("tagName")?.toLowerCase() === "th" || isHeader ? "th" : "td";
              result += `<${cellTag}>${convert($(td))}</${cellTag}>`;
            });
            result += "</tr>";
            isHeader = false;
          });
          result += `</table>`;
          break;
        }

        case "hr":
          result += "<hr/>";
          break;

        case "div":
        case "section":
        case "article":
        case "span":
        case "figure":
        case "figcaption":
          result += convert($el);
          break;

        default:
          result += convert($el);
      }
    });

    return result;
  }

  const body = convert($.root());

  return `<!doctype html><div class="lake-content" typography="classic"><blockquote id="${nextId()}"><p id="${nextId()}" class="ne-p"><span class="ne-text">原文链接：</span><a href="${escapeAttr(sourceUrl)}">${escapeLake(title)}</a></p></blockquote>${body}</div>`;
}

function escapeLake(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const crawlBlog: McpTool = {
  name: "yuque_crawl_blog",
  description: "博客园文章抓取+清洗+写入。一站式：fetch → cheerio HTML→Lake → save to Yuque。代码块带语法高亮/行号/主题。",

  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "博客园文章 URL" },
      source: { type: "string", description: "Source key，默认 cnblogs" },
      target_repo: { type: "string", description: "目标知识库 ID" },
      content_selector: { type: "string", description: "正文 CSS 选择器，默认 #cnblogs_post_body" },
      title_prefix: { type: "string", description: "标题前缀，默认 '[博客园] '" },
      headers: { type: "string", description: "自定义请求头 JSON" },
      timeout: { type: "number", description: "超时 ms（默认 15000）" },
      mode: { type: "string", description: "save | preview（默认 save）" },
    },
    required: ["url"],
  },

  async handler(args) {
    const __v = check(requiredString(args?.url, "url"));
    if (__v) return __v;

    const url = args!.url as string;
    const source = (args!.source as string) ?? "cnblogs";
    const targetRepoParam = args!.target_repo as string | undefined;
    const contentSelector = (args!.content_selector as string) ?? "#cnblogs_post_body";
    const titlePrefix = (args!.title_prefix as string) ?? "[博客园] ";
    const timeout = Math.min((args!.timeout as number) ?? 15000, 30000);
    const mode = (args!.mode as string) ?? "save";

    const cfg = loadConfig();
    const targetRepo = resolveRepo(source, targetRepoParam);

    // 1. 抓取
    let customHeaders: Record<string, string> = {};
    if (args!.headers && typeof args!.headers === "string") {
      try { customHeaders = JSON.parse(args!.headers); } catch { /* ignore */ }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const startedAt = Date.now();

    let html: string;
    let finalUrl: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; YuqueCrawler/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...customHeaders,
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      finalUrl = res.url;
      if (!res.ok) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            error: "FETCH_FAILED", message: `HTTP ${res.status}`, url,
          }, null, 2) }],
          isError: true,
        };
      }
      html = await res.text();
    } catch (err) {
      clearTimeout(timer);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : String(err),
          url,
        }, null, 2) }],
        isError: true,
      };
    }

    // 2. 提取正文区域
    const $ = cheerio.load(html);
    let bodyHtml = html;
    if (contentSelector) {
      const el = $(contentSelector);
      if (el.length > 0) {
        bodyHtml = el.html() || "";
      }
    }

    // 3. 提取标题
    let title = $("title").text().trim();
    title = title
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const docTitle = `${titlePrefix}${title || finalUrl}`;

    // 4. HTML → Lake
    const lake = htmlToLake(bodyHtml, finalUrl, title);
    const elapsed = Date.now() - startedAt;

    // 5. preview 模式
    if (mode === "preview") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            mode: "preview",
            url: finalUrl,
            title: docTitle,
            body_size: lake.length,
            body_preview: lake.substring(0, 500),
            elapsed_ms: elapsed,
          }, null, 2),
        }],
      };
    }

    // 6. 写入语雀
    if (!targetRepo) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "NO_TARGET_REPO",
          message: "未配置目标知识库",
        }, null, 2) }],
        isError: true,
      };
    }

    const slug = buildSlug(finalUrl);

    // 如果 slug 已存在，先删除旧文档
    try {
      await apiDelete(`/repos/${targetRepo}/docs/${slug}`, `Delete old doc: ${slug}`);
    } catch { /* 不存在则忽略 */ }

    const createResult = await apiPost(`/repos/${targetRepo}/docs`, {
      title: docTitle,
      body: lake,
      slug,
      description: `原文链接: ${finalUrl}`,
      format: "lake",
      public: 0,
    }, `Create doc: ${docTitle}`);

    if (isErrorResult(createResult)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          status: "failed",
          url: finalUrl,
          title: docTitle,
          error: JSON.stringify(createResult),
        }, null, 2) }],
        isError: true,
      };
    }

    const docId = (createResult as { data?: { id: number } })?.data?.id;

    // 加入目录
    if (docId) {
      try {
        await apiPut(`/repos/${targetRepo}/toc`, {
          action: "appendNode",
          action_mode: "sibling",
          type: "DOC",
          doc_ids: [docId],
        }, `Add to TOC: ${docTitle}`);
      } catch { /* TOC 失败不影响 */ }
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          status: "saved",
          url: finalUrl,
          title: docTitle,
          slug,
          doc_id: docId,
          target_repo: targetRepo,
          body_size: lake.length,
          elapsed_ms: elapsed,
        }, null, 2),
      }],
    };
  },
};
