// Predictor / Insights Hub, Stage 1 (selection only -- narrate.mjs's job to phrase, once this
// stage exists in narrate.mjs too, not yet added).
//
// *** COST-CRITICAL, read before touching the query logic below. ***
// SportsGameOdds bills per EVENT RETURNED, not per market/bookmaker -- confirmed from their own
// docs: "1 NBA game with 100 odds markets across 20 bookmakers = 1 object." The free tier is
// 2,500 objects/month. The first version of this script queried `leagueID=NFL&limit=100` on every
// run -- confirmed live that this alone can cost up to 100 objects PER CALL (the response's own
// `notice` field reported 15,336 bookmaker odds omitted due to tier limits on a single such call).
// Run that daily via fetch-data.yml and the scheduled pipeline ALONE -- zero site visitors --
// would burn ~3,000 objects/month, over budget before anyone ever loads the page. Frontend traffic
// costs nothing regardless (see docs/data-schema.md -- the site only ever reads a static
// data/current.json, never calls this or any API directly), but the cron schedule's own cost had
// to be fixed regardless of how many people visit.
//
// Fix: cache SportsGameOdds' own eventID for the current matchup (predictor.sgoEventId +
// predictor.espnEventId, the latter used to detect a new week's opponent). Once cached, re-fetch
// via `eventID=` (SGO docs: takes priority over all other filters) -- costs exactly 1 object.
// Only fall back to a broad discovery query when the matchup has changed, and even then bound it
// tightly with startsAfter/startsBefore + a small limit rather than pulling the whole league.
//
// Team matching also can't use a documented teamID filter (none exists) -- discovery still has to
// scan a window of events and match SGO's own stable team id (SEATTLE_SEAHAWKS_NFL, confirmed
// live) client-side. First version matched by kickoff timestamp alone instead, within a 90-minute
// window -- confirmed WRONG live (an unrelated Panthers @ Texans game shared that window). Team-id
// matching doesn't have that ambiguity.
import { readCurrent, writeCurrent } from "./lib/io.mjs";

const API_BASE = "https://api.sportsgameodds.com/v2";
const SGO_TEAM_ID = "SEATTLE_SEAHAWKS_NFL";
// Player-prop stat prefixes we care about for a skill-position-heavy predictor page. SGO's oddID
// format is {statID}-{statEntityID}-{periodID}-{betTypeID}-{sideID} -- filtering on statID prefix
// catches every player's line for that stat without needing to know player-specific ids upfront.
const PROP_STAT_IDS = ["passing_yards", "rushing_yards", "receiving_yards", "receptions"];

async function getJSON(url) {
  const res = await fetch(url, { headers: { "x-api-key": process.env.SPORTSGAMEODDS_API_KEY } });
  if (!res.ok) throw new Error(`SportsGameOdds request failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function findSeaEvent(events) {
  return events.find(
    (e) => e.teams?.home?.teamID === SGO_TEAM_ID || e.teams?.away?.teamID === SGO_TEAM_ID
  );
}

// Cheap path: 1 object. Only works once discoverEvent() (below) has run at least once for this
// matchup and cached the id.
async function fetchByEventId(eventId) {
  const body = await getJSON(`${API_BASE}/events?eventID=${eventId}`);
  return body.data?.[0] ?? null;
}

// Expensive-ish path, bounded on purpose: a +/-1 day window around ESPN's own kickoff time,
// capped at 25 events, instead of the whole league with no date bound (which is what cost up to
// 100 objects in the version that caused this whole audit). Only runs when the cache misses.
async function discoverEvent(kickoffIso) {
  const target = new Date(kickoffIso);
  const startsAfter = new Date(target.getTime() - 24 * 60 * 60_000).toISOString();
  const startsBefore = new Date(target.getTime() + 24 * 60 * 60_000).toISOString();
  const body = await getJSON(
    `${API_BASE}/events?leagueID=NFL&oddsAvailable=true&startsAfter=${startsAfter}&startsBefore=${startsBefore}&limit=25`
  );
  return findSeaEvent(body.data ?? []);
}

// Confirmed live 2026-08-27: byBookmaker is fully populated for game-level markets (moneyline,
// spread, total -- real FanDuel/DraftKings/BetMGM/etc lines), but EMPTY for player-prop markets
// on a preseason game this far out -- individual books haven't posted their own lines for a
// backup QB's passing yards yet. SportsGameOdds still computes its own consensus bookOdds/
// bookOverUnder in that case, so per-bookmaker rows are used when present, and a single
// "sportsgameodds" consensus row is used as a fallback rather than silently dropping real data.
function extractPropEdges(event) {
  if (!event?.odds) return [];
  return Object.values(event.odds)
    .filter((market) => PROP_STAT_IDS.includes(market.statID))
    .flatMap((market) => {
      const base = {
        oddID: market.oddID,
        statID: market.statID,
        periodID: market.periodID,
        betTypeID: market.betTypeID,
        sideID: market.sideID,
        playerId: market.playerID ?? null,
        marketName: market.marketName ?? null,
      };
      const byBookmaker = market.byBookmaker ?? {};
      if (Object.keys(byBookmaker).length > 0) {
        return Object.entries(byBookmaker)
          .filter(([, book]) => book.available)
          .map(([bookmaker, book]) => ({
            ...base,
            bookmaker,
            line: book.spread ?? book.overUnder ?? null,
            odds: book.odds ?? null,
          }));
      }
      if (!market.bookOddsAvailable) return [];
      return [{
        ...base,
        bookmaker: "sportsgameodds", // consensus line, not a specific book -- see comment above
        line: market.bookOverUnder ?? market.bookSpread ?? null,
        odds: market.bookOdds ?? null,
      }];
    });
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

  const cachedSgoId = current.predictor?.sgoEventId;
  const cacheIsForThisMatchup = current.predictor?.espnEventId === current.nextGame.eventId;

  let match = null;
  let objectsCost = 0;
  if (cachedSgoId && cacheIsForThisMatchup) {
    match = await fetchByEventId(cachedSgoId);
    objectsCost = 1;
    if (!match) console.log(`Cached SGO event ${cachedSgoId} no longer resolves -- falling back to discovery.`);
  }
  if (!match) {
    match = await discoverEvent(current.nextGame.date);
    objectsCost = "<=25"; // bounded by the discovery query's own limit, see discoverEvent()
  }

  if (!match) {
    console.log(
      `No SportsGameOdds event matched kickoff ${current.nextGame.date} (cost: ${objectsCost} objects) -- props likely not posted yet this far out.`
    );
    current.predictor = {
      asOf: new Date().toISOString(),
      sgoEventId: null,
      espnEventId: current.nextGame.eventId,
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
    espnEventId: current.nextGame.eventId, // cache key for next run's cheap eventID= lookup
    disclaimer: "For entertainment/informational purposes only — not betting advice.",
    // Raw lines only for now -- comparing against each player's recent-game trend (the actual
    // "edge" logic) is a follow-up once this fetch is confirmed working end to end.
    edges: rawEdges,
  };

  await writeCurrent(current);
  console.log(`Wrote ${rawEdges.length} raw prop lines for event ${match.eventID} (cost: ${objectsCost} objects).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
