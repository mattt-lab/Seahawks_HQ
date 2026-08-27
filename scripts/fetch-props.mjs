// Predictor / Insights Hub, Stage 1 (selection only -- narrate.mjs's job to phrase, once this
// stage exists in narrate.mjs too, not yet added).
//
// *** UNTESTED — written from SportsGameOdds' documented API, not confirmed against a real key or
// a real Seahawks matchup yet. Before trusting this in the pipeline: confirm events actually
// resolve for an SEA matchup this far before the season, confirm the oddID prefixes below match
// real market names, and check actual per-request object cost against the 2,500/month free-tier
// budget. See docs/data-schema.md "Known gaps". ***
//
// SportsGameOdds uses its own eventID/teamID space, unrelated to ESPN's -- there's no shared id
// to join on, so the matching SGO event is found by kickoff timestamp instead (see below).
import { readCurrent, writeCurrent } from "./lib/io.mjs";

const API_BASE = "https://api.sportsgameodds.com/v2";
// Player-prop stat prefixes we care about for a skill-position-heavy predictor page. SGO's oddID
// format is {statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID} -- filtering on statID prefix
// catches every player's line for that stat without needing to know player-specific ids upfront.
const PROP_STAT_IDS = ["passing_yards", "rushing_yards", "receiving_yards", "receptions"];

async function getJSON(url) {
  const res = await fetch(url, { headers: { "x-api-key": process.env.SPORTSGAMEODDS_API_KEY } });
  if (!res.ok) throw new Error(`SportsGameOdds request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function findMatchingEvent(events, kickoffIso, windowMinutes = 90) {
  const target = new Date(kickoffIso).getTime();
  return events.find((e) => Math.abs(new Date(e.status?.startsAt).getTime() - target) < windowMinutes * 60_000);
}

function extractPropEdges(event) {
  if (!event?.odds) return [];
  return Object.entries(event.odds)
    .filter(([oddID]) => PROP_STAT_IDS.some((stat) => oddID.startsWith(`${stat}-`)))
    .flatMap(([oddID, market]) => {
      const [statID, , periodID, betTypeID, sideID] = oddID.split("-");
      return Object.entries(market.byBookmaker ?? {}).map(([bookmaker, book]) => ({
        oddID,
        statID,
        periodID,
        betTypeID,
        sideID,
        bookmaker,
        line: book.spread ?? book.overUnder ?? null,
        odds: book.odds ?? null,
        available: book.available ?? false,
      }));
    })
    .filter((e) => e.available);
}

async function main() {
  const apiKey = process.env.SPORTSGAMEODDS_API_KEY;
  if (!apiKey) {
    console.log("No SPORTSGAMEODDS_API_KEY set -- skipping predictor fetch, leaving it as-is.");
    return;
  }

  const current = await readCurrent();
  if (!current?.nextGame) {
    console.log("No nextGame in data/current.json -- run fetch-team-data.mjs first.");
    return;
  }

  const body = await getJSON(`${API_BASE}/events?leagueID=NFL&oddsAvailable=true&limit=100`);
  const events = body.data ?? [];
  const match = findMatchingEvent(events, current.nextGame.date);

  if (!match) {
    console.log(
      `No SportsGameOdds event matched kickoff ${current.nextGame.date} -- props likely not posted yet this far out.`
    );
    current.predictor = {
      asOf: new Date().toISOString(),
      sgoEventId: null,
      disclaimer: current.predictor?.disclaimer ?? "For entertainment/informational purposes only — not betting advice.",
      edges: [],
    };
    await writeCurrent(current);
    return;
  }

  const rawEdges = extractPropEdges(match);

  current.predictor = {
    asOf: new Date().toISOString(),
    sgoEventId: match.eventID,
    disclaimer: "For entertainment/informational purposes only — not betting advice.",
    // Raw lines only for now -- comparing against each player's recent-game trend (the actual
    // "edge" logic) is a follow-up once this fetch is confirmed working end to end.
    edges: rawEdges,
  };

  await writeCurrent(current);
  console.log(`Wrote ${rawEdges.length} raw prop lines for event ${match.eventID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
