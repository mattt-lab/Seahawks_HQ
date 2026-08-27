# Seahawks HQ

A single-team Seattle Seahawks fan app: next-game odds/injuries/venue, NFC West standings, full
season schedule, roster, and a player-props predictor hub. Modeled on the same pipeline pattern as
[CFB HQ](https://github.com/mattt-lab/CFB_top25): a scheduled fetch pipeline writes one
`data/current.json` file, the frontend only ever reads that file, and Claude is only ever used for
phrasing already-selected facts, never for picking what matters.

See [`docs/data-schema.md`](docs/data-schema.md) for the full data contract.

## Data pipeline

Four scripts, each read-modify-write `data/current.json`:

```bash
node scripts/fetch-team-data.mjs   # ESPN: record, standings, schedule, roster, next game
node scripts/fetch-injuries.mjs    # Sleeper: standalone current injury report
node scripts/fetch-props.mjs       # SportsGameOdds: player prop lines (needs a key)
node scripts/narrate.mjs           # Claude: "what to watch" + recap text (falls back if no key)
```

`fetch-team-data.mjs` and `fetch-injuries.mjs` need no API key. `fetch-props.mjs` needs
`SPORTSGAMEODDS_API_KEY`; `narrate.mjs` uses `ANTHROPIC_API_KEY` if set, otherwise writes
deterministic fallback text. Get a free SportsGameOdds key at
[sportsgameodds.com/pricing](https://sportsgameodds.com/pricing) (the free tier's signup goes
through a Stripe checkout page, so expect to be asked for a card even at $0/month).

Run any script locally against a real key with the key inline, same convention as CFB HQ:

```bash
SPORTSGAMEODDS_API_KEY=... node scripts/fetch-props.mjs
```

In CI (`.github/workflows/fetch-data.yml`, daily + manual dispatch), keys come from repo secrets
(`SportsGameOdds_APIKey`, `ANTHROPIC_API_KEY`) and are never exposed outside that workflow run.

## Running the frontend locally

```bash
npm install
npm run dev      # dev server against whatever's in data/current.json
npm run lint      # oxlint
npm run build     # production build to dist/
```

## Deployment

`deploy-pages.yml` builds and pushes `dist/` to `gh-pages` on every push to `main`. First run
creates the `gh-pages` branch — after that, set Settings → Pages → Branch to `gh-pages` / `(root)`.
