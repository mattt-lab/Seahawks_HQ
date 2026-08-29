# Seahawks HQ

**Live at [mattt-lab.github.io/Seahawks_HQ](https://mattt-lab.github.io/Seahawks_HQ/)**

A single-team fan dashboard for Seattle Seahawks supporters — one page to check before kickoff
instead of hunting across ESPN, a sportsbook app, and Twitter. Modeled on the same pipeline pattern
as its sister project, [CFB HQ](https://github.com/mattt-lab/CFB_top25): a scheduled fetch pipeline
writes one `data/current.json` file, the frontend only ever reads that file (so site traffic costs
nothing regardless of visitor count), and Claude is only ever used for phrasing already-selected
facts, never for picking what matters. One deliberate exception: while a game is plausibly
underway, the browser polls ESPN's live-score endpoint directly every 60s for the current score
and clock — see `src/hooks/useLiveGameScore.js` and docs/data-schema.md for why.

## What's inside

- **Gameday** — next opponent, kickoff time and venue, the betting line, both teams' injury
  reports, a news-driven matchup buzz blurb pulled from Seahawks.com and Field Gulls, and a
  separate "What to Watch" card with a few AI-written bullets grounded strictly in that week's
  real data. Once a game starts: a live score and clock, polled directly from the browser every
  60s (not just the once-daily/15-min-cron server data); once it ends: an instant deterministic
  recap, replaced by a fuller AI-written one on the next pipeline run.
- **Schedule** — NFC West standings and the full 17-game regular season, opponent records included
  for an at-a-glance read on how the rest of the year stacks up.
- **Roster** — full roster by position group, plus a standalone current injury report cross-checked
  against a second independent data source. Starters are bolded and sorted first within each group
  (per ESPN's depth chart), with an optional starters-only filter.
- **Predictor** — player prop lines for the next game, shown as-is (no betting advice, no fake
  "locks") with a disclaimer up front.

Every panel that depends on data this project doesn't have yet (full head-to-head series history,
prop-line trend analysis) says so explicitly instead of rendering a blank dash — see
[`docs/data-schema.md`](docs/data-schema.md) for the full list of known gaps and the complete data
contract between the pipeline and the frontend.

## Tech stack

React 19 + Vite, deployed as a static build to GitHub Pages. Zustand-free — the data's static
enough not to need client state beyond what React Router already gives for free. Data sources:
[ESPN's hidden API](https://site.api.espn.com) (schedule, scores, roster, odds, injuries),
[Sleeper](https://docs.sleeper.com) (standalone injury report), and
[SportsGameOdds](https://sportsgameodds.com) (player props). Narration via the Anthropic SDK,
with a deterministic fallback whenever it's unavailable.

## Data pipeline

Six scripts, each read-modify-write `data/current.json`:

```bash
node scripts/fetch-team-data.mjs   # ESPN: record, standings, schedule, roster, next game, weather
node scripts/fetch-injuries.mjs    # Sleeper: standalone current injury report
node scripts/fetch-news.mjs        # Seahawks.com + Field Gulls RSS: matchup buzz blurb (no key)
node scripts/fetch-props.mjs       # SportsGameOdds: player prop lines (needs a key)
node scripts/narrate.mjs           # Claude: "what to watch" + recap text (falls back if no key)
node scripts/fetch-live-score.mjs  # ESPN: live status/score/period/clock/win probability
```

`fetch-live-score.mjs` runs on its own frequent schedule (`.github/workflows/fetch-live-score.yml`,
15-min polling scoped to Thu/Sun/Mon game windows) rather than the once-daily pipeline — built, but
not yet verified against an actual in-progress game; see `docs/data-schema.md`'s "Game status
lifecycle" for exactly what's confirmed vs. assumed.

`fetch-team-data.mjs`, `fetch-injuries.mjs`, and `fetch-news.mjs` need no API key. `fetch-props.mjs` needs
`SPORTSGAMEODDS_API_KEY`; `narrate.mjs` uses `ANTHROPIC_API_KEY` if set, otherwise writes
deterministic fallback text. Get a free SportsGameOdds key at
[sportsgameodds.com/pricing](https://sportsgameodds.com/pricing) (the free tier's signup goes
through a Stripe checkout page, so expect to be asked for a card even at $0/month). SportsGameOdds
bills per event returned, not per market — see `docs/data-schema.md`'s "API call budget" section
before changing the query logic in `fetch-props.mjs`; the original naive version could have burned
the entire monthly quota from the scheduled pipeline alone.

Run any script locally against a real key with the key inline, same convention as CFB HQ:

```bash
SPORTSGAMEODDS_API_KEY=... node scripts/fetch-props.mjs
```

(PowerShell: set it as its own statement first — `$env:SPORTSGAMEODDS_API_KEY = "..."` — then run
the script on the next line; the inline `VAR=value command` form above is Bash/Git Bash only.)

In CI (`.github/workflows/fetch-data.yml`, daily + manual dispatch), keys come from repo secrets
(`SportsGameOdds_APIKey`, `ANTHROPIC_API_KEY`) and are never exposed outside that workflow run.

## Running the frontend locally

```bash
npm install
npm run dev      # dev server against whatever's in data/current.json
npm run lint      # oxlint
npm run build     # production build to dist/
npm test          # vitest
```

## Deployment

`deploy-pages.yml` builds and pushes `dist/` to `gh-pages` on every push to `main`, which
[Settings → Pages](https://github.com/mattt-lab/Seahawks_HQ/settings/pages) (branch: `gh-pages`,
`/(root)`) serves. Analytics: Google Analytics (`G-9K08FK3SWH`, shared with CFB HQ and the F1
dashboard — broken out per-app by `page_path`/`page_location`, not a separate property).
