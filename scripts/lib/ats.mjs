// Against-the-spread (ATS) grading, shared by fetch-live-score.mjs and fetch-team-data.mjs so a
// game gets graded exactly once no matter which script first observes it final. A final score is
// permanent, so grading doesn't need to happen at the whistle -- any later run can do it, as long
// as the game's line is still in nextGame.oddsHistory (it is for the whole recap grace period).

// Closing line = the last snapshot captured at or before kickoff. Falls back to the last snapshot
// when none predate kickoff (e.g. history only started mid-game), rather than skipping the game.
export function closingLine(oddsHistory, kickoffIso) {
  const history = oddsHistory ?? [];
  const kickoffMs = kickoffIso ? new Date(kickoffIso).getTime() : NaN;
  const preKickoff = Number.isNaN(kickoffMs)
    ? []
    : history.filter((h) => new Date(h.capturedAt).getTime() <= kickoffMs);
  return (preKickoff.length ? preKickoff : history).at(-1) ?? null;
}

// Returns null (no entry) rather than guessing when no line was ever posted for this game.
export function computeAtsResult(game, seaScore, oppScore) {
  const closing = closingLine(game.oddsHistory, game.date);
  if (!closing || closing.spread == null || !closing.spreadTeam) return null;

  // The favorite must overcome its own spread (subtract), the underdog is credited it (add).
  // Works regardless of home/away -- only spreadTeam's identity matters.
  const signedSpreadForSea = closing.spreadTeam === "SEA" ? -Math.abs(closing.spread) : Math.abs(closing.spread);
  const adjustedMargin = (seaScore - oppScore) + signedSpreadForSea;
  const result = adjustedMargin > 0 ? "cover" : adjustedMargin < 0 ? "no-cover" : "push";

  return {
    eventId: game.eventId,
    week: game.week,
    opponent: game.opponent?.abbr ?? null,
    closingSpread: closing.spread,
    closingSpreadTeam: closing.spreadTeam,
    seaScore,
    oppScore,
    result,
    detectedAt: new Date().toISOString(),
  };
}

// Grades `game` into current.predictor unless that eventId was already graded. Returns the new
// entry, or null if skipped (already graded, no line, or scores unusable).
export function recordAts(current, game, seaScore, oppScore) {
  if (!Number.isFinite(seaScore) || !Number.isFinite(oppScore)) return null;
  current.predictor ??= {};
  const history = current.predictor.atsHistory ?? [];
  if (history.some((e) => e.eventId === game.eventId)) return null;

  const entry = computeAtsResult(game, seaScore, oppScore);
  if (!entry) return null;

  current.predictor.atsRecord ??= { wins: 0, losses: 0, pushes: 0 };
  if (entry.result === "cover") current.predictor.atsRecord.wins += 1;
  else if (entry.result === "no-cover") current.predictor.atsRecord.losses += 1;
  else current.predictor.atsRecord.pushes += 1;
  current.predictor.atsHistory = [...history, entry].slice(-30);
  return entry;
}

// Backstop for the daily run: if nextGame is a completed game, grade it from schedule[]'s final
// score. Covers every case where the live poller missed the in-progress -> final transition.
export function gradeFinalNextGame(current) {
  const game = current.nextGame;
  if (!game || game.live?.status !== "final") return null;
  const scheduled = (current.schedule ?? []).find((g) => g.eventId === game.eventId);
  if (!scheduled || scheduled.status !== "final") return null;
  return recordAts(current, game, scheduled.seaScore, scheduled.oppScore);
}
