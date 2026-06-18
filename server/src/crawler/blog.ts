import * as cheerio from "cheerio";
import crypto from "crypto";
import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { apiPost, apiPut, apiDelete, isErrorResult } from "../common/api-client.js";

function resolveRepo(source?: string, paramRepo?: string): number | null {
  const cfg = loadConfig();
  if (paramRepo) return parseInt(paramRepo, 10) || null;
  if (source && cfg.crawler?.namespaces?.[source]) {
    return cfg.crawler.namespaces[source].book_id ?? null;
  }
  return null;
}

function buildSlug(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex").substring(0, 12);
}

/** HTML → Markdown（cheerio） */
function htmlToMarkdown(html: string, sourceUrl: string, title: string): string {
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();
  $("img[data-src]").each((_, el) => {
    const dataSrc = $(el).attr("data-src");
    if (dataSrc) $(el).attr("src", dataSrc);
  });

  function convert(node: cheerio.Cheerio<any>): string {
    let result = "";
    node.contents().each((_, child) => {
      if (child.type === "text") {
        result += $(child).text();
        return;
      }
      if (child.type !== "tag") return;
      const tag = child.tagName?.toLowerCase();
      const $el = $(child);

      switch (tag) {
        case "h1": result += `\n# ${convert($el)}\n`; break;
        case "h2": result += `\n## ${convert($el)}\n`; break;
        case "h3": result += `\n### ${convert($el)}\n`; break;
        case "h4": result += `\n#### ${convert($el)}\n`; break;
        case "h5": result += `\n##### ${convert($el)}\n`; break;
        case "h6": result += `\n###### ${convert($el)}\n`; break;
        case "p": result += `\n${convert($el)}\n`; break;
        case "br": result += "\n"; break;
        case "strong": case "b": result += `**${convert($el)}**`; break;
        case "em": case "i": result += `*${convert($el)}*`; break;
        case "del": case "s": case "strike": result += `~~${convert($el)}~~`; break;
        case "a": {
          const href = $el.attr("href") || "";
          result += `[${convert($el)}](${href})`;
          break;
        }
        case "img": {
          const src = $el.attr("src") || $el.attr("data-src") || "";
          const alt = $el.attr("alt") || "";
          result += `![${alt}](${src})`;
          break;
        }
        case "code": result += `\`${$el.text()}\``; break;
        case "pre": {
          const codeEl = $el.find("code");
          const code = codeEl.length ? codeEl.text() : $el.text();
          let lang = "";
          if (codeEl.length) {
            const m = (codeEl.attr("class") || "").match(/language-(\w+)/);
            if (m) lang = m[1];
          }
          result += `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
          break;
        }
        case "blockquote": result += `\n> ${convert($el)}\n`; break;
        case "ul": case "ol": {
          const isOl = tag === "ol";
          let idx = 1;
          result += "\n";
          $el.children("li").each((_, li) => {
            result += isOl ? `${idx++}. ${convert($(li))}\n` : `- ${convert($(li))}\n`;
          });
          result += "\n";
          break;
        }
        case "table": {
          result += "\n";
          const rows: string[][] = [];
          $el.find("tr").each((_, tr) => {
            const cells: string[] = [];
            $(tr).find("th, td").each((__, td) => { cells.push(convert($(td)).replace(/\n/g, " ").trim()); });
            if (cells.length > 0) rows.push(cells);
          });
          if (rows.length > 0) {
            const h = rows[0].concat(Array(Math.max(0, Math.max(...rows.map(r => r.length)) - rows[0].length)).fill(""));
            result += "|" + h.join("|") + "|\n|" + h.map(() => "---").join("|") + "|\n";
            for (let i = 1; i < rows.length; i++) {
              const r = rows[i].concat(Array(h.length - rows[i].length).fill(""));
              result += "|" + r.join("|") + "|\n";
            }
          }
          result += "\n";
          break;
        }
        case "hr": result += "\n---\n"; break;
        default: result += convert($el); break;
      }
    });
    return result;
  }

  let body = convert($.root());
  body = body.replace(/\n{3,}/g, "\n\n").split("\n").map(l => l.trimEnd()).join("\n").trim();

  return `> 原文链接：[${title}](${sourceUrl})\n\n${body}`;
}

export const crawlBlog: McpTool = {
  name: "yuque_crawl_blog",
  description: "博客园文章抓取+清洗+写入。一站式：fetch → cheerio HTML→Markdown → save to Yuque（format: markdown）。代码块自动识别语言并加语法高亮。",

  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "博客园文章 URL" },
      source: { type: "string", description: "Source key，默认 cnblogs" },
      target_repo: { type: "string", description: "目标知识库 ID" },
      content_selector: { type: "string", description: "正文 CSS 选择器，默认 #cnblogs_post_body" },
      title_prefix: { type: "string", description: "标题前缀，默认 '[博客园] '" },
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
          content: [{ type: "text" as const, text: JSON.stringify({ error: "FETCH_FAILED", message: `HTTP ${res.status}`, url }, null, 2) }],
          isError: true,
        };
      }
      html = await res.text();
    } catch (err) {
      clearTimeout(timer);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NETWORK_ERROR", message: err instanceof Error ? err.message : String(err), url }, null, 2) }],
        isError: true,
      };
    }

    const $ = cheerio.load(html);
    let bodyHtml = html;
    if (contentSelector) {
      const el = $(contentSelector);
      if (el.length > 0) bodyHtml = el.html() || "";
    }

    let title = $("title").text().trim()
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    const docTitle = `${titlePrefix}${title || finalUrl}`;
    const markdown = htmlToMarkdown(bodyHtml, finalUrl, title);
    const elapsed = Date.now() - startedAt;

    if (mode === "preview") {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          mode: "preview", url: finalUrl, title: docTitle, body_size: markdown.length, body_preview: markdown.substring(0, 500), elapsed_ms: elapsed,
        }, null, 2) }],
      };
    }

    if (!targetRepo) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "NO_TARGET_REPO", message: "未配置目标知识库" }, null, 2) }],
        isError: true,
      };
    }

    const slug = buildSlug(finalUrl);

    // 删旧重建（确保 Markdown 格式被重新解析）
    try { await apiDelete(`/repos/${targetRepo}/docs/${slug}`, `Delete old: ${slug}`); } catch { /* ignore */ }

    const createResult = await apiPost(`/repos/${targetRepo}/docs`, {
      title: docTitle, body: markdown, slug,
      description: `原文链接: ${finalUrl}`,
      format: "markdown", public: 0,
    }, `Create doc: ${docTitle}`);

    if (isErrorResult(createResult)) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ status: "failed", url: finalUrl, title: docTitle, error: JSON.stringify(createResult) }, null, 2) }],
        isError: true,
      };
    }

    const docId = (createResult as { data?: { id: number } })?.data?.id;

    if (docId) {
      try {
        await apiPut(`/repos/${targetRepo}/toc`, { action: "appendNode", action_mode: "sibling", type: "DOC", doc_ids: [docId] }, `Add to TOC: ${docTitle}`);
      } catch { /* ignore */ }
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        status: "saved", url: finalUrl, title: docTitle, slug, doc_id: docId, target_repo: targetRepo, body_size: markdown.length, elapsed_ms: elapsed,
      }, null, 2) }],
    };
  },
};