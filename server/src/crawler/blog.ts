import * as cheerio from "cheerio";
import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { loadConfig } from "../common/config.js";
import { apiPost, apiPut, isErrorResult } from "../common/api-client.js";

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
  const crypto = require("crypto");
  return crypto.createHash("md5").update(url).digest("hex").substring(0, 12);
}

/**
 * HTML → Markdown 转换（基于 cheerio，非正则）
 * 处理：标题、代码块、表格、列表、链接、图片、粗斜体、引用、删除线
 */
function htmlToMarkdown(html: string, sourceUrl: string, title: string): string {
  const $ = cheerio.load(html);

  // 1. 移除 script/style/noscript/零宽字符
  $("script, style, noscript").remove();

  // 2. 处理 data-src 懒加载图片
  $("img[data-src]").each((_, el) => {
    const dataSrc = $(el).attr("data-src");
    if (dataSrc) $(el).attr("src", dataSrc);
  });

  // 3. 递归转换节点
  function convert(node: cheerio.Cheerio<any>): string {
    let result = "";

    node.contents().each((_, child) => {
      if (child.type === "text") {
        let text = $(child).text();
        // 解码实体
        text = text
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ");
        result += text;
        return;
      }

      if (child.type !== "tag") return;

      const tag = child.tagName?.toLowerCase();
      const $el = $(child);

      switch (tag) {
        case "h1": result += `\n\n# ${convert($el)}\n\n`; break;
        case "h2": result += `\n\n## ${convert($el)}\n\n`; break;
        case "h3": result += `\n\n### ${convert($el)}\n\n`; break;
        case "h4": result += `\n\n#### ${convert($el)}\n\n`; break;
        case "h5": result += `\n\n##### ${convert($el)}\n\n`; break;
        case "h6": result += `\n\n###### ${convert($el)}\n\n`; break;

        case "p":
          result += `\n\n${convert($el)}\n\n`;
          break;

        case "br":
          result += "\n";
          break;

        case "strong":
        case "b":
          result += `**${convert($el)}**`;
          break;

        case "em":
        case "i":
          result += `*${convert($el)}*`;
          break;

        case "del":
        case "s":
        case "strike":
          result += `~~${convert($el)}~~`;
          break;

        case "a": {
          const href = $el.attr("href") || "";
          const text = convert($el) || href;
          result += `[${text}](${href})`;
          break;
        }

        case "img": {
          const src = $el.attr("src") || $el.attr("data-src") || "";
          const alt = $el.attr("alt") || "";
          result += `![${alt}](${src})`;
          break;
        }

        case "code": {
          const parentTag = $el.parent().get(0)?.tagName?.toLowerCase();
          if (parentTag === "pre") {
            // 由 pre 统一处理
            return;
          }
          result += `\`${$el.text()}\``;
          break;
        }

        case "pre": {
          const codeEl = $el.find("code");
          const code = codeEl.length ? codeEl.text() : $el.text();
          result += `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
          break;
        }

        case "blockquote":
          result += `\n\n> ${convert($el).replace(/\n/g, "\n> ")}\n\n`;
          break;

        case "ul":
        case "ol": {
          const isOrdered = tag === "ol";
          let idx = 1;
          result += "\n";
          $el.children("li").each((_, li) => {
            const prefix = isOrdered ? `${idx++}. ` : "- ";
            result += `${prefix}${convert($(li))}\n`;
          });
          result += "\n";
          break;
        }

        case "li":
          // 嵌套列表由 ul/ol 处理
          result += convert($el);
          break;

        case "table": {
          result += "\n\n";
          const rows: string[][] = [];
          $el.find("tr").each((_, tr) => {
            const cells: string[] = [];
            $(tr).find("th, td").each((__, td) => {
              cells.push(convert($(td)).replace(/\n/g, " ").trim());
            });
            if (cells.length > 0) rows.push(cells);
          });
          if (rows.length > 0) {
            const colCount = Math.max(...rows.map(r => r.length));
            const padRow = (r: string[]) => r.concat(Array(colCount - r.length).fill(""));
            const header = padRow(rows[0]);
            const sep = header.map(() => "---");
            result += "|" + header.join("|") + "|\n";
            result += "|" + sep.join("|") + "|\n";
            for (let i = 1; i < rows.length; i++) {
              result += "|" + padRow(rows[i]).join("|") + "|\n";
            }
          }
          result += "\n";
          break;
        }

        case "hr":
          result += "\n\n---\n\n";
          break;

        case "div":
        case "section":
        case "article":
        case "span":
        case "figure":
        case "figcaption":
          // 块级/行内容器，递归处理
          result += convert($el);
          break;

        default:
          // 其他标签递归处理内容
          result += convert($el);
      }
    });

    return result;
  }

  let body = convert($.root());

  // 后处理
  body = body
    // 清理多余空行
    .replace(/\n{3,}/g, "\n\n")
    // 清理行首行尾空白
    .split("\n").map(l => l.trimEnd()).join("\n")
    .trim();

  // 组装最终文档
  const md = `> 原文链接：[${title}](${sourceUrl})\n\n${body}`;
  return md;
}

export const crawlBlog: McpTool = {
  name: "yuque_crawl_blog",
  description: "博客园文章抓取+清洗+写入。一站式：fetch → cheerio HTML→Markdown → save to Yuque。自动处理 data-src 图片、代码块、表格、链接等。",

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
    // 解码实体
    title = title
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const docTitle = `${titlePrefix}${title || finalUrl}`;

    // 4. HTML → Markdown（cheerio）
    const markdown = htmlToMarkdown(bodyHtml, finalUrl, title);

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
            body_size: markdown.length,
            body_preview: markdown.substring(0, 500),
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
    const createResult = await apiPost(`/repos/${targetRepo}/docs`, {
      title: docTitle,
      body: markdown,
      slug,
      description: `原文链接: ${finalUrl}`,
      format: "markdown",
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
          body_size: markdown.length,
          elapsed_ms: elapsed,
        }, null, 2),
      }],
    };
  },
};
