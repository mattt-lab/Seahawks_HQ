# Data schema

The contract between the fetch pipeline (`scripts/`) and the frontend (`src/`) — same role as
[CFB HQ's own `docs/data-schema.md`](https://github.com/mattt-lab/CFB_top25/blob/main/docs/data-schema.md).
Designed from live spikes against ESPN's hidden API, Sleeper, and SportsGameOdds, and implemented
— all four pipeline scripts are live-tested against real data, not just designed on paper.

## File layout

```
data/
  current.json          <- single consolidated file the frontend reads at build time
```

No `data/current.sample.json` fixture and no `data/franchise.json` exist — the Franchise page and
its data file were built, then killed (deemed not worth keeping) before either got real content, so
there was never anything to snapshot as a fixture either. A sample fixture for local dev without
hitting live APIs is still a reasonable thing to add later; it just isn't there today.

**No append-only per-week snapshot directory, unlike CFB HQ's `data/rankings/` and
`data/ratings/`.** Those exist there because a *cross-team ranking* needs point-in-time
correctness (an opponent's rank when you played them, not their rank today). A single-team app's
schedule doesn't have that problem — `schedule[].opponentRecord` below is always "opponent's
record as of the last pipeline run," and that's good enough for a schedule-strength color, so
there's nothing to snapshot.

## ID convention — deliberately different from CFB HQ

Every ESPN-sourced id in this schema is **ESPN's own numeric id, used as-is** (team `"26"`, event
`"401873305"`, athlete `"4432525"`) — never a custom slug. CFB HQ slugifies team names because
CFBD doesn't hand the frontend one clean stable id to join on; ESPN's hidden API does — the same
numeric team/athlete/event ids showed up consistently across every endpoint spiked. SportsGameOdds
data joins on its own `eventID`/`teamID`/`oddID` instead (different provider, different id space —
see `predictor` below); the two are bridged only by matchup (same two teams, same kickoff time),
not a shared id.

## Season-type gotcha (confirmed live, 2026-08-27)

`teams/26/schedule` **silently returns whatever season type is currently live** unless you pass
`seasontype` explicitly (`1`=preseason, `2`=regular, `3`=postseason) — fetched in late August with
no param, it returned 3 preseason games, not the 17-game regular season. The fetch script must
always pass `seasontype=2` for `schedule[]`, and separately track `meta.seasonType` for whichever
slate `nextGame` should actually be drawn from (still preseason for a few more weeks each year).

## Game status lifecycle

Same three-state convention as CFB HQ: `"scheduled"` → `"in_progress"` → `"final"`, on
`nextGame.live.status` and `schedule[].status`. The once-daily fetch of `teams/26/schedule` (no
true mid-game state) only ever writes `"scheduled"`/`"final"`. `scripts/fetch-live-score.mjs`
(`.github/workflows/fetch-live-score.yml`, 15-min polling scoped to Thu/Sun/Mon game windows) is
the only writer of `"in_progress"`, `.period`, `.clock`, and `.winProbability`, and also bumps
`record.overall` the moment it first sees the game go final rather than waiting for the next daily
run.

**Built but not live-tested** — no actual Seahawks game was in progress while writing this, so
`.period`/`.clock` (ESPN's well-established `status.period`/`status.displayClock` field names,
per their public-API convention) and the win-probability conversion were verified against a
**scheduled** game (empty `winprobability: []`, confirmed) and a **completed** one (populated,
confirmed shape: `{homeWinPercentage, tiePercentage, playId}` per entry, most recent = last array
element) — but never an actually in-progress one. Check this script's real output against the next
live Seahawks game before fully trusting it.

## `data/current.json`

```jsonc
{
  "meta": {
    "teamId": "26",
    "season": 2026,
    "seasonType": "PRE",              // "PRE" | "REG" | "POST" — which slate nextGame/schedule are drawn from
    "week": 4,
    "lastUpdated": "2026-08-27T18:31:00Z"
  },

  // From teams/26 `record.items` (total/home/road) — one fetch, no derivation needed.
  "record": {
    "overall": { "wins": 0, "losses": 2, "ties": 0, "winPercent": 0, "streak": -2, "pointDifferential": -13, "playoffSeed": 14 },
    "home":    { "wins": 0, "losses": 1, "ties": 0 },
    "road":    { "wins": 0, "losses": 1, "ties": 0 }
  },

  // From the core API: teams/26 -> groups.id ("3") -> .../types/2/groups/3/standings/0,
  // each entry's team + records[0] resolved via follow-up fetches (~9 calls total). Sorted by
  // winPercent desc, matching division order.
  "standings": {
    "division": "NFC West",
    "groupId": "3",
    "asOf": "2026-08-27T18:31:00Z",
    "entries": [
      { "teamId": "26", "abbr": "SEA", "wins": 0, "losses": 0, "ties": 0, "winPercent": 0, "gamesBehind": 0, "streak": 0, "pointDifferential": 0 },
      { "teamId": "14", "abbr": "LAR", "wins": 0, "losses": 0, "ties": 0, "winPercent": 0, "gamesBehind": 0, "streak": 0, "pointDifferential": 0 },
      { "teamId": "22", "abbr": "ARI", "wins": 0, "losses": 0, "ties": 0, "winPercent": 0, "gamesBehind": 0, "streak": 0, "pointDifferential": 0 },
      { "teamId": "25", "abbr": "SF",  "wins": 0, "losses": 0, "ties": 0, "winPercent": 0, "gamesBehind": 0, "streak": 0, "pointDifferential": 0 }
    ]
  },

  // The Gameday Command Center. One event, entirely from summary?event={eventId} plus the
  // opponent lookup already in schedule[]. This is the one object that changes shape most as
  // status moves scheduled -> in_progress -> final.
  "nextGame": {
    "eventId": "401873305",
    "week": 4,
    "seasonType": "PRE",
    "date": "2026-08-29T00:00Z",
    "homeAway": "away",
    "opponent": { "id": "12", "abbr": "KC", "name": "Kansas City Chiefs" },
    // `indoor` isn't from ESPN -- it's looked up from lib/venues.mjs, a hand-maintained table of
    // all 32 stadiums (ESPN's venue object has no lat/long and no indoor/outdoor flag at all).
    // "indoor" covers both fixed domes AND retractable roofs, deliberately simplified -- no data
    // source gives live roof status, and most retractable-roof games are played closed anyway.
    "venue": { "name": "Arrowhead Stadium", "city": "Kansas City", "state": "MO", "surface": "grass", "indoor": false },

    // lib/weather.mjs, via Open-Meteo (free, no key) using the host venue's hand-maintained
    // lat/long. null for indoor venues (not fetched -- doesn't matter there) or when kickoff is
    // further out than Open-Meteo's ~16-day forecast window. Real bug caught while building this:
    // Open-Meteo's hourly timestamps are LOCAL time at the venue, not UTC -- naively comparing
    // against a UTC kickoff time silently matched the wrong hour by the venue's UTC offset (5
    // hours for Kansas City), confirmed live (matched local midnight instead of the actual 7pm
    // kickoff, a materially different forecast). Fixed via utc_offset_seconds-aware comparison.
    "weather": { "tempF": 88, "precipPercent": 0, "windMph": 7, "condition": "Clear", "forecastFor": "2026-08-28T19:00" },

    "broadcast": null,                // summary.broadcasts[0].names — null if ESPN has no media entry yet

    // summary.pickcenter[0] (DraftKings by default) -- the GAME-level line (spread/total/ML), kept
    // separate from player PROPS, which come from SportsGameOdds instead (see `predictor` below).
    // Confirmed present 2+ days out; exactly how early in the week odds first populate wasn't
    // tested -- null until posted either way.
    "odds": {
      "provider": "DraftKings",
      "spread": -1.5, "spreadTeam": "KC", "details": "KC -1.5",
      "overUnder": 34.5,
      "moneyline": { "sea": -110, "kc": -130 }
    },

    // Deliberately scoped down from "full head-to-head history" (all-time record, last 5
    // meetings) to just "did we already play this exact opponent earlier THIS season" -- no
    // source gives the former, and the user explicitly said they don't care about it anyway.
    // Division rivals play twice a year, so this rematch case is real and worth surfacing;
    // computed by scanning `schedule[]` for a completed game against the same opponent id.
    "seriesHistory": { "playedEarlierThisSeason": false },
    // when true, also carries: "week": 3, "result": "W", "seaScore": 24, "oppScore": 17

    // summary.injuries, split by team — this game's context only, NOT the same shape as the
    // standalone `injuries` report below (different source, different fields — see that section).
    "injuries": {
      "sea": [
        { "athleteId": "4432525", "name": "Mason Richman", "position": "G", "status": "Injured Reserve", "bodyPart": "Leg", "side": "Not Specified", "returnDate": "2027-02-15" }
      ],
      "opponent": []
    },

    // Deliberately NOT "yards allowed" -- no source spiked exposes that per-stat. avgPointsAgainst
    // is from the team record endpoint (same one `record` above reads); sacksPerGame is from
    // teams/{id}/statistics' "defensive" category (tackles/sacks/INTs, not yards-allowed -- that
    // category genuinely doesn't have a yards-allowed figure). Feeds both nextGame.whatToWatch and
    // predictor.edges[].insight below. See buildDefenseContext() in fetch-team-data.mjs.
    "defense": {
      "sea": { "avgPointsAgainst": 18, "sacksPerGame": 2.765 },
      "opponent": { "avgPointsAgainst": 18, "sacksPerGame": 2.059 }
    },

    // Stage 2 output: 3 short bullets, grounded in Stage 1-selected facts (form, injuries, defense
    // context) — same selection-is-math/phrasing-is-Claude split as CFB HQ. seasonType-aware: a
    // preseason game explicitly gets roster-battle framing instead of fabricated stakes ("doesn't
    // count in the standings" is itself one of the deterministic-fallback bullets when isPreseason
    // is true) -- deliberately NOT using ESPN's summary.news for this, confirmed live that it's
    // mostly generic league news unrelated to the actual matchup (see narrate.mjs's top comment).
    "whatToWatch": [
      { "text": "...", "blurbSource": "llm" }
    ],

    // Written by fetch-team-data.mjs (status "scheduled"/"final" only) and, during actual game
    // windows, by fetch-live-score.mjs (the only writer of "in_progress"/period/clock/
    // winProbability) -- see "Game status lifecycle" above, including the not-yet-live-tested
    // caveat. A live scoring-play feed (not just the current score) is still not built.
    "live": {
      "status": "scheduled",          // "scheduled" | "in_progress" | "final"
      "awayScore": null, "homeScore": null,
      "period": null, "clock": null,  // e.g. period 3, clock "8:42" -- only set while status is "in_progress"
      "winProbability": null          // SEA's own win% (0-100), converted from ESPN's home-team-relative figure; null unless status is "in_progress"
    },

    "recap": { "text": null, "blurbSource": null }   // populated once live.status is "final"
  },

  // Full season, from teams/26/schedule?season=2026&seasontype=2 (see season-type gotcha above).
  // Chronological. `opponentRecord` is fetch-time-current, not a point-in-time snapshot (see
  // "File layout" above) — good enough for a schedule-strength color, not for historical claims.
  "schedule": [
    {
      "eventId": "401873279", "week": 2, "seasonType": "PRE",
      "date": "2026-08-16T00:00Z",
      "opponent": { "id": "6", "abbr": "DAL", "name": "Dallas Cowboys" },
      "homeAway": "home",
      "venue": "Lumen Field",
      "broadcast": null,
      "status": "final",              // "scheduled" | "in_progress" | "final"
      "result": "L", "seaScore": 10, "oppScore": 24,
      "opponentRecord": { "wins": 0, "losses": 0, "ties": 0 }
    }
  ],

  // teams/26/roster, regrouped. Per-athlete `injuries` from this endpoint was empty even for
  // players later confirmed hurt elsewhere — not populated here, use the standalone report below.
  // `starter` is cross-referenced from teams/26/depthcharts (a separate endpoint, confirmed live
  // 2026-08-27) -- true for whichever athlete is listed FIRST at any position, across all of
  // ESPN's depth-chart groups (offense, base defensive front, special teams). A position with
  // only one athlete listed (kicker, punter, long snapper) still counts as having a starter, just
  // no depth competition to show. Multiple entries can share the same position abbreviation (WR
  // has 3 separate depth-chart slots) -- iterating every position entry, not deduping by
  // abbreviation, is what correctly marks all 3 starting receivers rather than just one.
  "roster": {
    "asOf": "2026-08-27T18:31:00Z",
    "groups": [
      {
        "position": "offense",
        "players": [
          { "id": "4678006", "name": "Elijah Arroyo", "pos": "TE", "jersey": "18", "age": 23, "experience": 2, "starter": false }
        ]
      }
    ]
  },

  // Standalone current injury report (not tied to nextGame's opponent). Sourced from Sleeper's
  // players endpoint (api.sleeper.app/v1/players/nfl, filtered to team === "SEA") — cross-checked
  // against ESPN's per-game list and confirmed matching. Flatter shape than nextGame.injuries.sea
  // above (no side/returnDate) because it's a different upstream source — do not assume parity.
  "injuries": {
    "asOf": "2026-08-27T18:31:00Z",
    "source": "sleeper",
    "report": [
      { "playerId": "...", "name": "Mason Richman", "position": "G", "status": "IR", "bodyPart": "Knee", "notes": null }
    ]
  },

  // Predictor / Insights Hub. Sourced from SportsGameOdds' GET /v2/events (leagueID=NFL,
  // oddsAvailable=true), matched to the Seahawks' event by SGO's own stable team id
  // (SEATTLE_SEAHAWKS_NFL) -- NOT by kickoff timestamp, which was the first approach tried and
  // confirmed WRONG live (multiple unrelated games can share a kickoff window). One entry per
  // player prop line SportsGameOdds carries for a Seahawks player. Currently raw lines only --
  // the "edge" logic now compares each line against real team defensive context (see
  // nextGame.defense above), but NOT a player recent-game trend -- confirmed live via ESPN's
  // gamelog endpoint that these specific backup/preseason players have no current-season game log
  // yet, so "recentAverage" isn't a gap in the code, it's a gap in what exists to fetch right now.
  "predictor": {
    "asOf": "2026-08-27T22:02:29.363Z",
    "sgoEventId": "Ka1cXIh5r3hBg5J8Qfmn",  // SportsGameOdds' own eventID -- different id space than ESPN's
    "disclaimer": "For entertainment/informational purposes only — not betting advice.",
    "edges": [
      {
        // One row per MARKET (player+stat+period+betType), not per side -- the first version
        // emitted a separate over row and under row with an identical line, which just doubled
        // every prop in the UI. Grouped by (statID, playerID, periodID, betTypeID) instead.
        "statID": "passing_yards", "periodID": "game", "betTypeID": "ou",
        "playerId": "JALEN_MILROE_1_NFL",       // SGO's own player id -- not the same as any ESPN/roster id
        "marketName": "Jalen Milroe Passing Yards",  // SGO's own marketName with " Over/Under" stripped
        "side": "sea",                           // "sea" | "opponent" -- coarse name match against `roster`,
                                                  // since SGO and ESPN don't share an id space (see fetch-props.mjs)
        "bookmaker": "sportsgameodds",           // a REAL sportsbook name (e.g. "draftkings") when byBookmaker is
                                                  // populated, or "sportsgameodds" for their own consensus/fair-
                                                  // value line -- confirmed live: individual books hadn't posted
                                                  // lines yet for this backup QB's props (preseason, 2 days out)
        "line": "177.5", "overOdds": "+100", "underOdds": "+100",
        // Stage 2 (narrate.mjs): one honest sentence using nextGame.defense + an explicit
        // small-sample/preseason caveat -- never a fabricated player trend. blurbSource "llm" |
        // "fallback", carried forward across runs by fetch-props.mjs once set (not re-narrated
        // every single pipeline run for a market it's already covered).
        "insight": "Seattle's defense is allowing 18 pts/game -- no meaningful current-season game log to compare this line against yet, and backups this deep into preseason see uneven, unpredictable snap counts.",
        "blurbSource": "llm"
      }
    ]
  }
}
```

## Known gaps (do not fabricate — leave null until sourced)

- **nflverse advanced stats / EPA trends** — planned for the Season Tracker's "deeper analytics"
  Phase 2 item, but no fields are reserved for it yet in this schema; design that once it's
  actually being built, not speculatively now.
- **Player recent-game trend for Predictor edges** — genuinely unavailable right now, not just
  unbuilt: ESPN's athlete gamelog endpoint returned zero events for the 2026 season for a Seahawks
  backup QB, confirmed live. `insight` text leans on team-level defensive context instead and says
  so explicitly rather than pretending a trend exists. Revisit once these players have real
  current-season snaps logged somewhere.

## API call budget (audited 2026-08-27, after a real quota near-miss)

The frontend never calls any API directly — it only reads the committed `data/current.json`, so
**site traffic costs nothing regardless of visitor count**. The only cost is the scheduled
pipeline (`fetch-data.yml`, once daily), and one of its four calls needed a real fix:

- **ESPN** (`fetch-team-data.mjs`, ~30 calls/run: team, schedule×2, one `summary?event=`,
  9 for standings, roster, ~14-17 opponent-record lookups) and **Sleeper**
  (`fetch-injuries.mjs`, 1 call/run, no auth) — both free, unofficial-but-generous, no rate limit
  hit across 15+ manual test runs today. Once-daily cron is trivial volume for either.
- **SportsGameOdds** (`fetch-props.mjs`) — the one with a real hard quota (2,500 "objects"/month
  free tier) and it's billed **per event returned, not per market/bookmaker**, confirmed straight
  from their docs. The first version queried `leagueID=NFL&limit=100` unconditionally — confirmed
  live that a single such call can cost up to 100 objects (the response's own `notice` field
  reported 15,336 bookmaker odds omitted due to tier limits). Run daily, that alone would have
  cost ~3,000 objects/month — **over budget from the cron schedule alone, before any visitor**.
  Fixed by caching SportsGameOdds' own `eventID` for the current matchup
  (`predictor.sgoEventId`/`predictor.espnEventId`) and re-fetching via the cheap `eventID=` filter
  (1 object) on every run except when the matchup actually changes week to week, which falls back
  to a `startsAfter`/`startsBefore`-bounded discovery query (≤25 objects). Live-confirmed both
  paths: cold run cost ≤25 objects, the very next run (cache hit) cost exactly 1. Worst case
  ~1×25 + 6×1 ≈ 31 objects/week, comfortably inside the free tier.
- **Anthropic** (`narrate.mjs`) — 1-2 short calls/run, only when `ANTHROPIC_API_KEY` is set.
  Billed usage, not a throttling concern at this volume.
- No API exposes a usage/quota-remaining endpoint that was found — SportsGameOdds' actual
  consumption can only be checked from their own account dashboard, not queried programmatically.

## Who populates what

| Field | Populated by |
|---|---|
| `meta`, `record`, `standings`, `schedule`, `roster` | fetch script, once daily, from ESPN's site + core API |
| `nextGame` (minus `whatToWatch`/`recap`) | fetch script, from `summary?event={nextGame.eventId}` |
| `injuries` (standalone report) | fetch script, from Sleeper's players endpoint, filtered to `team === "SEA"` |
| `nextGame.whatToWatch[].text`, `nextGame.recap.text` | Stage 2 narration (Claude), with a deterministic fallback sentence on failure — same discipline as CFB HQ's `narrate.mjs` |
| `nextGame.live.status`/`awayScore`/`homeScore` (`"scheduled"`/`"final"` only) | fetch script, from the same schedule/summary data — no extra call |
| `nextGame.live.status = "in_progress"`, `.period`, `.clock`, `.winProbability`, and the instant `record.overall` bump on final | `fetch-live-score.mjs`, 15-min polling scoped to Thu/Sun/Mon game windows — built, but not yet live-tested against an actual in-progress game (see "Game status lifecycle") |
| `nextGame.defense` | fetch script, from `teams/{id}` (avgPointsAgainst) + `teams/{id}/statistics` (sacksPerGame), for both SEA and the opponent |
| `nextGame.venue.indoor` | fetch script, looked up from `lib/venues.mjs` (hand-maintained, not fetched) |
| `nextGame.weather` | fetch script, from Open-Meteo via `lib/weather.mjs` — only for outdoor venues, only within its ~16-day forecast window |
| `predictor.edges` (minus `insight`/`blurbSource`) | `fetch-props.mjs`, from SportsGameOdds' `/v2/events` — live-tested, see "API call budget" above |
| `predictor.edges[].insight`, `.blurbSource` | Stage 2 narration (Claude), with a deterministic fallback — same discipline as `nextGame.whatToWatch` |
