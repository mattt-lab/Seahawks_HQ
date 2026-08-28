// Frequent, lightweight companion to fetch-team-data.mjs -- patches live/final status, score,
// period, clock, and win probability into nextGame.live between the once-daily pipeline's runs.
// Mirrors CFB HQ's fetch-live-scores.mjs role, adapted for a single-team app (one game to check,
// not a whole slate -- one summary?event= call per tick instead of CFBD's all-games /scoreboard).
//
// *** win probability is UNCONFIRMED against a real in-progress game -- no live game existed
// while building this, only a pre-game (empty winprobability[]) and a final one (populated,
// confirmed shape: {homeWinPercentage, tiePercentage, playId} per entry, most recent = last
// array element) were available to spike. period/displayClock field names are ESPN's
// well-established public-API convention but were NOT confirmed live here either, unlike every
// other field this project has shipped. Check this script's own console output against the
// browser network tab next time SEA actually plays, before fully trusting it. ***
import { getSummary } from "./lib/espn.mjs";
import { readCurrent, writeCurrent } from "./lib/io.mjs";

// Against-the-spread (ATS) grading, computed the instant a game goes final (same "don't wait for
// tomorrow's fetch-team-data.mjs run" reasoning as the record.overall bump below). Grades against
// the LAST entry in nextGame.oddsHistory -- an approximation of the closing line, since that
// history is only ever updated once daily by fetch-team-data.mjs, not necessarily right at
// kickoff. Returns null (no entry recorded) rather than guessing when no line was ever posted for
// this game -- a real gap some weeks (e.g. deep preseason), not a bug.
function computeAtsResult(nextGame, seaScore, oppScore) {
  const closing = (nextGame.oddsHistory ?? []).at(-1);
  if (!closing || closing.spread == null || !closing.spreadTeam) return null;

  // Positive = points added to SEA's actual margin for grading purposes: the favorite must
  // overcome its own spread (subtract), the underdog is credited it (add). Works regardless of
  // whether SEA is home/away/favorite/underdog -- only spreadTeam's identity matters.
  const signedSpreadForSea = closing.spreadTeam === "SEA" ? -Math.abs(closing.spread) : Math.abs(closing.spread);
  const adjustedMargin = (seaScore - oppScore) + signedSpreadForSea;
  const result = adjustedMargin > 0 ? "cover" : adjustedMargin < 0 ? "no-cover" : "push";

  return {
    eventId: nextGame.eventId,
    week: nextGame.week,
    opponent: nextGame.opponent?.abbr ?? null,
    closingSpread: closing.spread,
    closingSpreadTeam: closing.spreadTeam,
    seaScore,
    oppScore,
    result,
    detectedAt: new Date().toISOString(),
  };
}

async function main() {
  const current = await readCurrent();
  if (!current?.nextGame) {
    console.log("No nextGame -- nothing to poll.");
    return;
  }
  if (current.nextGame.live?.status === "final") {
    console.log("Already final -- nothing to poll (also guards against double-bumping record on repeat ticks).");
    return;
  }

  const summary = await getSummary(current.nextGame.eventId);
  const comp = summary.header?.competitions?.[0];
  const state = comp?.status?.type?.state; // "pre" | "in" | "post"

  if (state === "pre") {
    console.log("Game hasn't started yet -- nothing to update.");
    return;
  }

  const competitors = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c.homeAway === "home");
  const awayC = competitors.find((c) => c.homeAway === "away");
  const seaIsHome = current.nextGame.homeAway === "home";
  const isFinalNow = state === "post";

  const wpEntries = summary.winprobability ?? [];
  const latestWp = wpEntries[wpEntries.length - 1];
  const seaWinProbability = latestWp
    ? Math.round((seaIsHome ? latestWp.homeWinPercentage : 1 - latestWp.homeWinPercentage - (latestWp.tiePercentage ?? 0)) * 1000) / 10
    : null;

  current.nextGame.live = {
    status: isFinalNow ? "final" : "in_progress",
    awayScore: awayC?.score != null ? Number(awayC.score) : null,
    homeScore: homeC?.score != null ? Number(homeC.score) : null,
    period: comp?.status?.period ?? null,
    clock: comp?.status?.displayClock ?? null,
    winProbability: isFinalNow ? null : seaWinProbability,
  };

  if (isFinalNow) {
    const seaScore = Number(seaIsHome ? homeC?.score : awayC?.score);
    const oppScore = Number(seaIsHome ? awayC?.score : homeC?.score);
    const won = seaScore > oppScore;
    // Instant record bump so the site's right today, not just after tomorrow's fetch-team-data.mjs
    // run -- that run will still recompute the authoritative numbers from ESPN directly regardless.
    current.record.overall.wins += won ? 1 : 0;
    current.record.overall.losses += won ? 0 : 1;
    current.record.overall.streak = won
      ? (current.record.overall.streak > 0 ? current.record.overall.streak + 1 : 1)
      : (current.record.overall.streak < 0 ? current.record.overall.streak - 1 : -1);

    const atsEntry = computeAtsResult(current.nextGame, seaScore, oppScore);
    if (atsEntry) {
      current.predictor.atsRecord ??= { wins: 0, losses: 0, pushes: 0 };
      if (atsEntry.result === "cover") current.predictor.atsRecord.wins += 1;
      else if (atsEntry.result === "no-cover") current.predictor.atsRecord.losses += 1;
      else current.predictor.atsRecord.pushes += 1;
      current.predictor.atsHistory = [...(current.predictor.atsHistory ?? []), atsEntry].slice(-30);
    }
  }

  await writeCurrent(current);
  console.log(
    `Live poll: ${current.nextGame.live.status} SEA ${seaIsHome ? current.nextGame.live.homeScore : current.nextGame.live.awayScore}` +
    `-${seaIsHome ? current.nextGame.live.awayScore : current.nextGame.live.homeScore}` +
    `${seaWinProbability != null ? `, SEA win prob ${seaWinProbability}%` : ""}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
