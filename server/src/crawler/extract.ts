/**
 * crawler/extract — CSS 选择器提取
 *
 * 职责：传入 HTML 字符串 + CSS 选择器，提取文本/属性/HTML。
 * 使用简单的正则 + 字符串解析，不依赖 jsdom（保持零外部依赖）。
 *
 * 支持的选择器：
 *   - tag: "div", "p", "a", "h1" 等
 *   - .class: ".content", ".article-title"
 *   - #id: "#main"
 *   - tag.class: "div.content", "a.link"
 *   - [attr]: "[href]", "[data-id]"
 *   - 组合: "div.content a.link"
 *
 * 限制：不支持伪类 (:nth-child)、属性值匹配 ([attr=val])、兄弟选择器 (+/~)。
 *       复杂场景建议 Agent 用 yuque_crawl_fetch 拿 HTML 后自行解析。
 */

import type { McpTool } from "../common/types.js";
import { check, requiredString } from "../common/validate.js";
import { unescapeHtml } from "../common/text-utils.js";

interface ExtractResult {
  selector: string;
  count: number;
  items: Array<{
    text: string;
    html: string;
    attrs: Record<string, string>;
  }>;
}

/**
 * 简易 CSS 选择器解析
 * 将 "div.content a.link" 拆成 [{tag:"div",cls:"content"}, {tag:"a",cls:"link"}]
 */
interface SelectorPart {
  tag: string;
  cls: string;
  id: string;
  attr: string;
}

function parseSelector(selector: string): SelectorPart[] {
  return selector
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const result: SelectorPart = { tag: "", cls: "", id: "", attr: "" };

      // [attr]
      const attrMatch = part.match(/^\[([^\]]+)\]$/);
      if (attrMatch) {
        result.attr = attrMatch[1];
        return result;
      }

      // #id
      const idMatch = part.match(/#([\w-]+)/);
      if (idMatch) result.id = idMatch[1];

      // .class (可能有多个)
      const clsMatches = part.match(/\.([\w-]+)/g);
      if (clsMatches) result.cls = clsMatches.map((c) => c.slice(1)).join(" ");

      // tag
      const tagMatch = part.match(/^([\w-]+)/);
      if (tagMatch) result.tag = tagMatch[1].toLowerCase();

      return result;
    });
}

/** 检查元素是否匹配选择器片段 */
function matchesPart(el: string, part: SelectorPart): boolean {
  if (part.tag && !el.startsWith(`<${part.tag}`)) return false;
  if (part.id && !el.includes(`id="${part.id}"`) && !el.includes(`id='${part.id}'`)) return false;
  if (part.cls) {
    const clsParts = part.cls.split(" ");
    for (const c of clsParts) {
      if (!el.includes(`class="${c}"`) && !el.includes(`class='${c}'`) &&
          !el.match(new RegExp(`class="[^"]*\\b${c}\\b[^"]*"`)) &&
          !el.match(new RegExp(`class='[^']*\\b${c}\\b[^']*'`))) {
        return false;
      }
    }
  }
  if (part.attr && !el.includes(`${part.attr}=`)) return false;
  return true;
}

/** 提取元素的属性 */
function extractAttrs(el: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /(\w[\w-]*)=["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(el)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/** 提取元素的文本内容（去除标签） */
function extractText(el: string): string {
  return unescapeHtml(
    el.replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
  ).trim();
}

/**
 * 在 HTML 中查找匹配选择器的所有元素
 * 策略：先按最后一个选择器部分找候选元素，再向上验证父级匹配
 */
function findAll(html: string, parts: SelectorPart[]): string[] {
  if (parts.length === 0) return [];

  const lastPart = parts[parts.length - 1];
  const parentParts = parts.slice(0, -1);

  // 构建候选元素的正则
  let tagPattern: string;
  if (lastPart.tag) {
    tagPattern = lastPart.tag;
  } else {
    tagPattern = "\\w+";
  }

  const tagRe = new RegExp(`<(${tagPattern})(\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "gi");

  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const fullTag = m[0];
    if (!matchesPart(fullTag, lastPart)) continue;

    // 检查父级匹配
    if (parentParts.length > 0) {
      const beforeText = html.substring(0, m.index);
      if (!checkParents(beforeText, parentParts)) continue;
    }

    results.push(fullTag);
  }

  return results;
}

/** 检查 HTML 前缀中是否包含匹配的父级元素 */
function checkParents(beforeText: string, parts: SelectorPart[]): boolean {
  // 从后往前匹配父级
  const reversed = [...parts].reverse();
  let remaining = beforeText;

  for (const part of reversed) {
    const tag = part.tag || "\\w+";
    const openRe = new RegExp(`<(${tag})(\\s[^>]*)?>`, "gi");
    const closeRe = new RegExp(`</(${tag})>`, "gi");

    // 从末尾往前找，匹配开闭标签
    let depth = 0;
    let found = false;

    // 收集所有开闭标签位置
    interface Marker { pos: number; isOpen: boolean; raw: string; }
    const markers: Marker[] = [];

    let m: RegExpExecArray | null;
    while ((m = openRe.exec(remaining)) !== null) {
      markers.push({ pos: m.index, isOpen: true, raw: m[0] });
    }
    while ((m = closeRe.exec(remaining)) !== null) {
      markers.push({ pos: m.index, isOpen: false, raw: m[0] });
    }
    markers.sort((a, b) => b.pos - a.pos); // 从后往前

    for (const mk of markers) {
      if (mk.isOpen) {
        if (depth === 0 && matchesPart(mk.raw, part)) {
          remaining = remaining.substring(0, mk.pos);
          found = true;
          break;
        }
        depth--;
      } else {
        depth++;
      }
    }

    if (!found) return false;
  }

  return true;
}

export const crawlExtract: McpTool = {
  name: "yuque_crawl_extract",
  description: "Extract content from HTML using CSS selectors (tag, .class, #id, [attr]). Returns text/html/attrs for each match. For complex selectors (:nth-child, etc.), Agent should parse raw HTML from yuque_crawl_fetch. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      html: { type: "string", description: "Raw HTML string to extract from" },
      selector: { type: "string", description: "CSS selector, e.g. 'div.content a.link', '.article-title', '#main'" },
      attr: { type: "string", description: "Extract specific attribute value instead of text, e.g. 'href', 'src'" },
      limit: { type: "number", description: "Max items to return (default 50, max 200)" },
      raw: { type: "boolean", description: "Return raw full JSON (default false, returns summary)" },
    },
    required: ["html", "selector"],
  },

  async handler(args) {
    const __v = check(
      requiredString(args?.html, "html"),
      requiredString(args?.selector, "selector"),
    );
    if (__v) return __v;

    const html = args?.html as string;
    const selector = args?.selector as string;
    const attr = args?.attr as string | undefined;
    const limit = Math.min((args?.limit as number) ?? 50, 200);

    const parts = parseSelector(selector);
    if (parts.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "INVALID_SELECTOR",
          message: `无法解析选择器: ${selector}`,
        }, null, 2) }],
        isError: true,
      };
    }

    const elements = findAll(html, parts).slice(0, limit);

    const items = elements.map((el) => {
      const attrs = extractAttrs(el);
      return {
        text: extractText(el),
        html: el,
        attrs,
      };
    });

    // 如果指定了 attr，只返回属性值
    if (attr) {
      const attrItems = items.map((item) => item.attrs[attr] || null).filter(Boolean);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            selector,
            attr,
            count: attrItems.length,
            values: attrItems,
          }, null, 2),
        }],
      };
    }

    const result: ExtractResult = { selector, count: items.length, items };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
};
