import { useEffect, useRef, useState } from 'react';

// Same "browser calls the live-score API directly" pattern as the F1/TdF/World Cup dashboards
// (their `fetchESPN()`/30s `setInterval` in wc-dashboard.html) -- a deliberate, narrow exception
// to this project's own "the frontend never calls any API directly" principle (see
// docs/data-schema.md), because the committed data/current.json can only ever be as fresh as the
// last pipeline run. fetch-live-score.mjs already polls this same endpoint server-side, but at
// 15-minute granularity and only during specific cron windows -- nowhere near enough for a score
// and clock that are supposed to look "live" while someone has the page open, and it goes stale
// for hours whenever that cron misses its window (the exact bug this hook fixes).
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const POLL_MS = 60000;
// Generous pre/post-kickoff window, same reasoning as the World Cup dashboard's `elapsedMin<200`
// check: start polling a bit before kickoff so this catches the scheduled->in_progress
// transition even if the committed build hasn't caught up yet, and keep polling well past a
// normal game length to cover overtime and any post-game score-settling lag.
const PRE_KICKOFF_MS = 20 * 60_000;
const POST_KICKOFF_WINDOW_MS = 240 * 60_000;

function parseLive(summary, seaIsHome) {
  const comp = summary?.header?.competitions?.[0];
  if (!comp) return null;
  const state = comp.status?.type?.state; // 'pre' | 'in' | 'post'
  const competitors = comp.competitors ?? [];
  const homeC = competitors.find((c) => c.homeAway === 'home');
  const awayC = competitors.find((c) => c.homeAway === 'away');

  const wpEntries = summary.winprobability ?? [];
  const latestWp = wpEntries[wpEntries.length - 1];
  const seaWinProbability = state === 'in' && latestWp
    ? Math.round((seaIsHome ? latestWp.homeWinPercentage : 1 - latestWp.homeWinPercentage - (latestWp.tiePercentage ?? 0)) * 1000) / 10
    : null;

  return {
    status: state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled',
    awayScore: awayC?.score != null ? Number(awayC.score) : null,
    homeScore: homeC?.score != null ? Number(homeC.score) : null,
    period: comp.status?.period ?? null,
    clock: comp.status?.displayClock ?? null,
    winProbability: seaWinProbability,
  };
}

// Returns the freshest known `live` object for `nextGame` -- a client-polled one while the game
// is plausibly underway, falling back to whatever the committed build already has otherwise.
// Resets and re-evaluates whenever the game itself changes (a new eventId), not on every render.
export function useLiveGameScore(nextGame) {
  const [liveOverride, setLiveOverride] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    setLiveOverride(null);
    if (!nextGame?.eventId || !nextGame?.date) return undefined;

    const kickoff = new Date(nextGame.date).getTime();
    const seaIsHome = nextGame.homeAway === 'home';

    function shouldPoll() {
      if (nextGame.live?.status === 'final') return false; // committed data already has the result
      const now = Date.now();
      return now >= kickoff - PRE_KICKOFF_MS && now <= kickoff + POST_KICKOFF_WINDOW_MS;
    }

    async function tick() {
      if (!shouldPoll()) {
        clearInterval(timerRef.current);
        return;
      }
      try {
        const res = await fetch(`${ESPN_SUMMARY}?event=${nextGame.eventId}`);
        if (!res.ok) return;
        const parsed = parseLive(await res.json(), seaIsHome);
        if (!parsed) return;
        setLiveOverride(parsed);
        if (parsed.status === 'final') clearInterval(timerRef.current);
      } catch {
        // A dropped poll just tries again next tick -- nothing to surface to the reader over one
        // flaky request.
      }
    }

    if (shouldPoll()) {
      tick();
      timerRef.current = setInterval(tick, POLL_MS);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nextGame is a frozen build-time
    // import, never reassigned client-side; keying on its stable identity fields is intentional.
  }, [nextGame?.eventId, nextGame?.date, nextGame?.homeAway]);

  return liveOverride ?? nextGame?.live ?? null;
}
