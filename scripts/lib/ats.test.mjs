import { describe, expect, it } from "vitest";
import { closingLine, computeAtsResult, gradeFinalNextGame, recordAts } from "./ats.mjs";

const KICKOFF = "2026-10-04T20:25Z";
const game = (oddsHistory, extra = {}) => ({
  eventId: "e1", week: 4, opponent: { abbr: "LAC" }, date: KICKOFF, oddsHistory, ...extra,
});
const snap = (capturedAt, spread, spreadTeam = "SEA") => ({ capturedAt, spread, spreadTeam, overUnder: 44 });
const fresh = () => ({ predictor: { atsRecord: { wins: 0, losses: 0, pushes: 0 }, atsHistory: [] } });

describe("closingLine", () => {
  it("uses the last snapshot at or before kickoff, ignoring in-game/post-game snapshots", () => {
    const h = [snap("2026-10-03T17:00:00Z", 6.5), snap("2026-10-04T17:36:00Z", 7), snap("2026-10-05T00:07:00Z", 3)];
    expect(closingLine(h, KICKOFF).spread).toBe(7);
  });
  it("falls back to the last snapshot when none predate kickoff", () => {
    expect(closingLine([snap("2026-10-04T22:00:00Z", 3)], KICKOFF).spread).toBe(3);
  });
  it("returns null with no history", () => {
    expect(closingLine([], KICKOFF)).toBeNull();
  });
});

describe("computeAtsResult", () => {
  it("grades a favorite that wins by exactly the spread as a push", () => {
    expect(computeAtsResult(game([snap("2026-10-03T00:00:00Z", 7)]), 30, 23).result).toBe("push");
  });
  it("treats the stored spread as an absolute value keyed off spreadTeam", () => {
    // SEA favored by 3.5, wins by 3 -> no cover; the stored sign (home-relative) is irrelevant.
    expect(computeAtsResult(game([snap("2026-10-03T00:00:00Z", 3.5)]), 13, 10).result).toBe("no-cover");
    expect(computeAtsResult(game([snap("2026-10-03T00:00:00Z", -3.5)]), 13, 10).result).toBe("no-cover");
  });
  it("credits an underdog its spread", () => {
    const h = [snap("2026-10-03T00:00:00Z", 2.5, "DEN")];
    expect(computeAtsResult(game(h), 15, 17).result).toBe("cover"); // loses by 2, +2.5
    expect(computeAtsResult(game(h), 14, 17).result).toBe("no-cover"); // loses by 3, +2.5
  });
  it("returns null when no line was ever posted", () => {
    expect(computeAtsResult(game([]), 20, 10)).toBeNull();
  });
});

describe("recordAts", () => {
  it("grades once per eventId and updates the running record", () => {
    const current = fresh();
    const g = game([snap("2026-10-03T00:00:00Z", 3.5)]);
    expect(recordAts(current, g, 30, 10)).not.toBeNull();
    expect(recordAts(current, g, 30, 10)).toBeNull();
    expect(current.predictor.atsRecord).toEqual({ wins: 1, losses: 0, pushes: 0 });
    expect(current.predictor.atsHistory).toHaveLength(1);
  });
});

describe("gradeFinalNextGame (daily-run backstop)", () => {
  const withFinal = (status = "final") => ({
    ...fresh(),
    nextGame: game([snap("2026-10-03T00:00:00Z", 7)], { live: { status } }),
    schedule: [{ eventId: "e1", status: "final", seaScore: 30, oppScore: 23 }],
  });
  it("grades a final game the live poller never caught", () => {
    const current = withFinal();
    expect(gradeFinalNextGame(current)?.result).toBe("push");
    expect(current.predictor.atsRecord.pushes).toBe(1);
  });
  it("does nothing while the game isn't final", () => {
    expect(gradeFinalNextGame(withFinal("scheduled"))).toBeNull();
  });
});
