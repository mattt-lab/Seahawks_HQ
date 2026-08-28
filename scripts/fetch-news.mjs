// Beat-writer / analysis roundup for the Gameday hero -- independent Seahawks coverage the
// generic team app doesn't curate (it only ever surfaces the club's own seahawks.com stories).
// Mixes the team's own official feed with an independent analysis site, both free/no-key, so the
// homepage isn't just repeating what a fan already gets from the Seahawks app or from ESPN.
//
// Both URLs confirmed live 2026-08-28 (HTTP 200, real recent entries). Others spiked and rejected:
// Seattle Times' feed returns an empty body (bot-gated), Seahawks Wire's /feed/ path 404s and
// /?feed=rss2 doesn't return real RSS -- not worth chasing the right URL for a "nice to have"
// third source right now.
import { readCurrent, writeCurrent } from "./lib/io.mjs";
import { parseFeed } from "./lib/rss.mjs";

const FEEDS = [
  { url: "https://www.seahawks.com/rss/news", source: "Seahawks.com" },
  { url: "https://www.fieldgulls.com/rss/index.xml", source: "Field Gulls" },
];

async function fetchFeed({ url, source }) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SeahawksHQ/1.0)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.text(), source);
  } catch (err) {
    // One dead/renamed feed shouldn't blank the whole panel -- log and carry on with whatever
    // else was fetched, same tolerance as fetch-team-data.mjs's weather fetch failure handling.
    console.error(`Feed fetch failed for ${source} (${url}):`, err.message);
    return [];
  }
}

async function main() {
  const current = await readCurrent();
  if (!current) {
    console.log("No data/current.json yet -- run fetch-team-data.mjs first.");
    return;
  }

  const results = await Promise.all(FEEDS.map(fetchFeed));
  const items = results
    .flat()
    .filter((item) => item.publishedAt)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 8);

  current.news = { asOf: new Date().toISOString(), items };
  await writeCurrent(current);
  console.log(`Wrote ${items.length} news item(s) from ${FEEDS.length} feed(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
