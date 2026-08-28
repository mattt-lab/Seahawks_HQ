// Minimal RSS 2.0 / Atom feed parser -- no XML library dependency (the project deliberately has
// none; see git history on removed deps). Regex-based rather than a real XML parser: brittle to a
// feed that reformats its markup, but both feeds fetch-news.mjs uses were spiked live and only
// four fields are needed (title, link, published date, a short description), which doesn't
// justify a new dependency for two known, stable shapes.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", "#8230": "…" };

function decodeEntities(s) {
  return s.replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m);
}

// Descriptions/summaries can carry inline HTML (a stray <a>, an <em>) even inside RSS/Atom's own
// text fields -- strip it so what reaches the LLM prompt (narrate.mjs) is plain prose, not markup.
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

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
      // Atom's <summary> and RSS's <description> play the same role -- a short teaser, not the
      // full article. Deliberately NOT reading Atom's <content> here even though Field Gulls'
      // feed happens to carry the entire article body there -- see narrate.mjs's matchup-blurb
      // prompt for why this stays snippet-only rather than full-article text.
      const descRaw = isAtom ? tag(block, "summary") : tag(block, "description");
      const description = descRaw ? stripTags(descRaw) : null;
      return { title, link, source, publishedAt, description };
    })
    .filter((item) => item.title && item.link);
}
