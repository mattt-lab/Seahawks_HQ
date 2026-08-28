// Minimal RSS 2.0 / Atom feed parser -- no XML library dependency (the project deliberately has
// none; see git history on removed deps). Regex-based rather than a real XML parser: brittle to a
// feed that reformats its markup, but both feeds fetch-news.mjs uses were spiked live and only
// three fields are needed (title, link, published date), which doesn't justify a new dependency
// for two known, stable shapes.
function unwrapCdata(s) {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (m ? m[1] : s).trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? unwrapCdata(m[1]) : null;
}

function attr(block, tagName, attrName) {
  const m = block.match(new RegExp(`<${tagName}[^>]*\\s${attrName}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

// Confirmed live 2026-08-28 against both real feed shapes: Field Gulls (SB Nation/Vox) serves
// Atom (<feed><entry>...<link rel="alternate" href="..."/>), Seahawks.com serves RSS 2.0
// (<rss><channel><item><link>...</link>). Detected by root element rather than trusting either
// feed's declared content-type, which real servers don't always set precisely.
export function parseFeed(xml, source) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const entryTag = isAtom ? "entry" : "item";
  const blocks = [...xml.matchAll(new RegExp(`<${entryTag}[^>]*>([\\s\\S]*?)</${entryTag}>`, "gi"))].map((m) => m[1]);

  return blocks
    .map((block) => {
      const title = tag(block, "title");
      const link = isAtom ? attr(block, "link", "href") : tag(block, "link");
      const publishedRaw = isAtom ? (tag(block, "published") ?? tag(block, "updated")) : tag(block, "pubDate");
      const publishedAt = publishedRaw && !Number.isNaN(Date.parse(publishedRaw))
        ? new Date(publishedRaw).toISOString()
        : null;
      return { title, link, source, publishedAt };
    })
    .filter((item) => item.title && item.link);
}
