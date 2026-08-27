# Data schema

The contract between the fetch pipeline (`scripts/`) and the frontend (`src/`) — same role as
[CFB HQ's own `docs/data-schema.md`](https://github.com/mattt-lab/CFB_top25/blob/main/docs/data-schema.md).
Designed from live spikes against ESPN's hidden API, Sleeper, and SportsGameOdds. **Not yet
implemented — no fetch script exists yet.**

## File layout

```
data/
  current.json          <- single consolidated file the frontend reads at build time
  current.sample.json   <- fixture matching this schema, mock data, no live API needed
  franchise.json         <- static hand-maintained (Ring of Honor, retired numbers, all-time
                             series record by opponent) — NOT fetched from any API, same pattern
                             as CFB HQ's data/rivalries.json
```

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
`nextGame.live.status` and `schedule[].status`. MVP only ever writes `"scheduled"`/`"final"` from
the once-daily fetch of `teams/26/schedule` (which has no true mid-game state). A lightweight
poller (Phase 2, mirroring `fetch-live-scores.mjs`) would be the only writer of `"in_progress"`,
`period`, and `clock`, scoped to actual Seahawks game windows only.

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
    "venue": { "name": "Arrowhead Stadium", "city": "Kansas City", "state": "MO", "surface": "grass" },
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

    // NOT YET SOURCED. No endpoint in the spike returned head-to-head series history (all-time
    // record vs this opponent, last 5 meetings). Leave null with this field present — do not
    // fabricate a plausible-looking record — until a real source is confirmed (candidates: an
    // untested ESPN head-to-head endpoint, or deriving it ourselves from full historical
    // schedules once enough seasons of `schedule[]` data have accumulated).
    "seriesHistory": null,

    // summary.injuries, split by team — this game's context only, NOT the same shape as the
    // standalone `injuries` report below (different source, different fields — see that section).
    "injuries": {
      "sea": [
        { "athleteId": "4432525", "name": "Mason Richman", "position": "G", "status": "Injured Reserve", "bodyPart": "Leg", "side": "Not Specified", "returnDate": "2027-02-15" }
      ],
      "opponent": []
    },

    // Stage 2 output: 3 short hyped bullets, grounded in Stage 1-selected facts (form, injuries,
    // matchup deltas) — same selection-is-math/phrasing-is-Claude split as CFB HQ.
    "whatToWatch": [
      { "text": "...", "blurbSource": "llm" }
    ],

    // MVP-lite: status + score only. winProbability and a live scoring-play feed are Phase 2.
    "live": {
      "status": "scheduled",          // "scheduled" | "in_progress" | "final"
      "awayScore": null, "homeScore": null,
      "period": null, "clock": null,
      "winProbability": null          // always null until Phase 2 ships
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
  "roster": {
    "asOf": "2026-08-27T18:31:00Z",
    "groups": [
      {
        "position": "offense",
        "players": [
          { "id": "4678006", "name": "Elijah Arroyo", "pos": "TE", "jersey": "18", "age": 23, "experience": 2 }
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
  // the "edge" logic (comparing each line against a player's real recent-game trend) is a
  // follow-up, not built yet, so don't expect recentAverage/edgeSign/blurb below until it ships.
  "predictor": {
    "asOf": "2026-08-27T22:02:29.363Z",
    "sgoEventId": "Ka1cXIh5r3hBg5J8Qfmn",  // SportsGameOdds' own eventID -- different id space than ESPN's
    "disclaimer": "For entertainment/informational purposes only — not betting advice.",
    "edges": [
      {
        "oddID": "passing_yards-JALEN_MILROE_1_NFL-game-ou-over",  // SGO's own compound id -- kept verbatim for traceability/debugging
        "statID": "passing_yards", "periodID": "game", "betTypeID": "ou", "sideID": "over",
        "playerId": "JALEN_MILROE_1_NFL",       // SGO's own player id -- not the same as any ESPN/roster id
        "marketName": "Jalen Milroe Passing Yards Over/Under",  // human-readable, straight from SGO -- use this over building one from statID
        "bookmaker": "sportsgameodds",           // a REAL sportsbook name (e.g. "draftkings") when byBookmaker is populated,
                                                  // or the literal string "sportsgameodds" for their own consensus/fair-value
                                                  // line -- confirmed live: individual books hadn't posted lines yet for this
                                                  // backup QB's props (preseason, 2 days out), byBookmaker was `{}`, but SGO's
                                                  // own bookOdds/bookOverUnder were still populated -- used as a fallback rather
                                                  // than silently dropping real data
        "line": "177.5", "odds": "+100"
        // NOT YET BUILT: "recentAverage" (player's actual recent-game trend for this stat) and
        // "edgeSign"/"blurb"/"blurbSource" -- the actual selection+narration logic that makes this
        // a "predictor" rather than a raw odds dump.
      }
    ]
  }
}
```

## `data/franchise.json`

Static, hand-maintained, versioned in the repo — same pattern as CFB HQ's `data/rivalries.json`.
Not derived from any API; edited by hand as history happens (a Ring of Honor induction, a new
franchise record).

```jsonc
{
  "allTimeRecordByOpponent": {
    "KC": { "wins": 0, "losses": 0, "ties": 0 }
    // one entry per opponent abbr the Seahawks have ever played
  },
  "ringOfHonor": [
    { "name": "Steve Largent", "inducted": 1989 }
  ],
  "retiredNumbers": [
    { "number": 12, "note": "The 12th Man — retired for the fans, not a player" }
  ],
  "notableMoments": [
    { "year": 2013, "text": "Super Bowl XLVIII championship" }
  ]
}
```

## Known gaps (do not fabricate — leave null until sourced)

- **Series history vs. next opponent** — no endpoint returned this in the spike. Needs either an
  untested ESPN head-to-head endpoint, or deriving it from accumulated `schedule[]` history over
  time (slow — would take years to build a meaningful "last 5 meetings").
- **Weather** — `summary.gameInfo.venue` has city/state/surface but no forecast. Only matters for
  outdoor stadiums; would need a separate weather API keyed off venue lat/long + kickoff time, not
  yet chosen.
- **nflverse advanced stats / EPA trends** — planned for the Season Tracker's "deeper analytics"
  Phase 2 item, but no fields are reserved for it yet in this schema; design that once it's
  actually being built, not speculatively now.
- **Predictor edge logic** — `fetch-props.mjs` now pulls real, live-confirmed prop lines (see
  below), but only the raw lines. Comparing each line against a player's actual recent-game trend
  — the part that makes this a "predictor" rather than an odds dump — isn't built.

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
| `nextGame.live.status = "in_progress"`, `.period`, `.clock`, `.winProbability` | Phase 2 — a bounded live poller, not built yet |
| `predictor.edges` | Phase 2 pipeline stage, from SportsGameOdds' `/v2/events` — not built or live-tested yet |
| `data/franchise.json` | hand-maintained, not fetched |
