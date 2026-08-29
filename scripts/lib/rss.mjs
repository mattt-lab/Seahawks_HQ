// Minimal RSS 2.0 / Atom feed parser -- no XML library dependency (the project deliberately has
// none; see git history on removed deps). Regex-based rather than a real XML parser: brittle to a
// feed that reformats its markup, but both feeds fetch-news.mjs uses were spiked live and only
// four fields are needed (title, link, published date, a short description), which doesn't
// justify a new dependency for two known, stable shapes.
// Named entities need a lookup table (there's no way to derive them), but numeric ones
// (&#8217; / &#x2019;) directly encode a Unicode code point and can always be decoded
// generically -- a hardcoded per-value map for those was the actual bug: real news copy is full
// of curly quotes/dashes (&#8216; &#8217; &#8220; &#8221; &#8211; &#8212; ...) that a small
// hand-picked set will keep missing one at a time. Confirmed live 2026-08-29: a Field Gulls title
// showed a literal "&#8217;" on the page because #8217 specifically wasn't in the old list.
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity] ?? match;
    const codePoint = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
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
  // Entity-decoded here (not just in stripTags for descriptions) so titles get it too -- CDATA
  // wrapping a title's content doesn't stop it from containing literal entity text, and until
  // now titles skipped decodeEntities entirely.
  return m ? decodeEntities(unwrapCdata(m[1])) : null;
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
