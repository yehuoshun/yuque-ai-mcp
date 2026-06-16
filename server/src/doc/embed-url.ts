/**
 * doc/embed-url — 生成语雀文档嵌入阅读器 URL
 *
 * 端点：无（纯工具函数，基于语雀嵌入文档阅读器规范）
 * 职责：根据文档 URL 或 doc_id + book 信息，生成嵌入模式 URL
 *
 * 参考：https://www.yuque.com/yuque/developer/embed
 */

import type { McpTool } from "../common/types.js";

export const docEmbedUrl: McpTool = {
  name: "yuque_embed_url",
  description: "Generate a Yuque embed reader URL from a document link or doc_id+book_id. 详见 references/api/extended_api.md",

  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Full Yuque document URL, e.g. https://www.yuque.com/yuque/developer/embed (mutually exclusive with doc_id+book)",
      },
      doc_id: {
        type: "string",
        description: "Document ID (mutually exclusive with url, requires book_id or namespace)",
      },
      book_id: {
        type: "string",
        description: "Repository ID or namespace (e.g. yuque/developer), used with doc_id",
      },
      from: {
        type: "string",
        description: "Caller app name (required). Use your team/app English name",
      },
      title: {
        type: "number",
        description: "Show title: 1=show, 0=hide",
      },
      outline: {
        type: "number",
        description: "Show outline sidebar: 1=show, 0=hide",
      },
      translate: {
        type: "string",
        description:
          "翻译语种，支持：en/zh/ru/pt/es/fr/ja/ar/de/it/ko/tr/vi/pl/he/id/hi/nl/th",
      },
    },
    required: ["from"],
  },

  async handler(args) {
    const from = args?.from as string;
    const url = args?.url as string | undefined;
    const docId = args?.doc_id as string | undefined;
    const bookId = args?.book_id as string | undefined;
    const title = args?.title as number | undefined;
    const outline = args?.outline as number | undefined;
    const translate = args?.translate as string | undefined;

    let baseUrl: string;

    if (url) {
      // 从完整 URL 中提取基础部分（去掉已有参数）
      const u = new URL(url);
      u.search = "";
      baseUrl = u.toString();
    } else if (docId && bookId) {
      // 根据 doc_id + book_id 拼接
      baseUrl = `https://www.yuque.com/${bookId}/${docId}`;
    } else {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "请提供 url 或 (doc_id + book_id) / Provide url or (doc_id + book_id)",
                usage: {
                  url: "https://www.yuque.com/yuque/developer/embed",
                  from: "your_appname",
                },
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    // 拼接参数
    const params = new URLSearchParams();
    params.set("view", "doc_embed");
    params.set("from", from);

    if (title !== undefined) params.set("title", String(title));
    if (outline !== undefined) params.set("outline", String(outline));
    if (translate) params.set("translate", translate);

    const embedUrl = `${baseUrl}?${params.toString()}`;

    // 生成 iframe 代码
    const iframeCode = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0"></iframe>`;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              embed_url: embedUrl,
              iframe_code: iframeCode,
              params: {
                view: "doc_embed",
                from,
                title: title ?? "默认（显示）",
                outline: outline ?? "默认（显示）",
                translate: translate ?? "无",
              },
              note: "嵌入模式仅支持公开文档，私密文档请通过 API 获取内容后自行渲染 / Embed mode only supports public documents. For private docs, fetch content via API and render yourself.",
              supported_languages: {
                en: "英语",
                zh: "中文",
                ru: "俄罗斯语",
                pt: "葡萄牙语",
                es: "西班牙语",
                fr: "法语",
                ja: "日语",
                ar: "阿拉伯语",
                de: "德语",
                it: "意大利语",
                ko: "韩语",
                tr: "土耳其语",
                vi: "越南语",
                pl: "波兰语",
                he: "希伯来语",
                id: "印尼语",
                hi: "印地语",
                nl: "荷兰语",
                th: "泰语",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
