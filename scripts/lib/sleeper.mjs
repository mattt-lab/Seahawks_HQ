// api.sleeper.app/v1/players/nfl is a single ~5MB JSON blob of every NFL player -- free, no auth,
// no documented rate limit. Confirmed live 2026-08-27: SEA's injury_status/injury_body_part
// entries matched ESPN's per-game injury list exactly (same players, same body parts).
const PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";

export async function getTeamInjuryReport(teamAbbr) {
  const res = await fetch(PLAYERS_URL);
  if (!res.ok) throw new Error(`Sleeper request failed: ${res.status}`);
  const players = await res.json();

  return Object.values(players)
    .filter((p) => p.team === teamAbbr && p.injury_status)
    .map((p) => ({
      playerId: p.player_id,
      name: p.full_name,
      position: p.position,
      status: p.injury_status,
      bodyPart: p.injury_body_part || null,
      notes: p.injury_notes || null,
    }));
}
