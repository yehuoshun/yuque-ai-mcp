const cheerio = require("cheerio");

function htmlToMarkdown(html, sourceUrl, title) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  $("img[data-src]").each((_, el) => {
    const dataSrc = $(el).attr("data-src");
    if (dataSrc) $(el).attr("src", dataSrc);
  });

  function convert(node) {
    let result = "";
    node.contents().each((_, child) => {
      if (child.type === "text") {
        result += $(child).text();
        return;
      }
      if (child.type !== "tag") return;
      const tag = child.tagName.toLowerCase();
      const $el = $(child);
      
      if (tag === "pre") {
        const codeEl = $el.find("code");
        const code = codeEl.length ? codeEl.text() : $el.text();
        result += "\n\n```\n" + code + "\n```\n\n";
        console.log("HIT pre, code length:", code.length);
        return;
      }
      
      result += convert($el);
    });
    return result;
  }

  let body = convert($.root());
  body = body.replace(/\n{3,}/g, "\n\n").split("\n").map(l => l.trimEnd()).join("\n").trim();
  return "> " + title + "\n\n" + body;
}

async function main() {
  const res = await fetch("https://www.cnblogs.com/ylxin/p/20576021");
  const html = await res.text();
  const $ = cheerio.load(html);
  const bodyHtml = $("#cnblogs_post_body").html() || "";
  const title = $("title").text().trim();
  
  const md = htmlToMarkdown(bodyHtml, "https://www.cnblogs.com/ylxin/p/20576021", title);
  console.log("has backtick:", md.includes("`"));
  const idx = md.indexOf("```");
  if (idx >= 0) console.log(md.substring(idx, idx+300));
}
main().catch(console.error);