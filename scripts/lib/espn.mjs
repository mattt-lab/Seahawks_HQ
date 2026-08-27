const SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE_BASE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

export const TEAM_ID = "26";
// NFC West group id, from teams/26 -> groups.id. Confirmed live 2026-08-27 by resolving all 4
// division members (LAR/ARI/SF/SEA) out of this exact group.
export const DIVISION_GROUP_ID = "3";

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN request failed: ${res.status} ${url}`);
  return res.json();
}

export async function getTeam(teamId = TEAM_ID) {
  const body = await getJSON(`${SITE_BASE}/teams/${teamId}`);
  return body.team;
}

// seasonType: 1=preseason, 2=regular, 3=postseason. Omit both to get whichever slate ESPN
// currently considers "live" -- confirmed live that this is NOT always the regular season (it
// silently returns preseason in August), so callers that specifically want the 17-game regular
// season must always pass seasonType: 2 explicitly.
export function getSchedule({ teamId = TEAM_ID, season, seasonType } = {}) {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  if (seasonType) params.set("seasontype", seasonType);
  const qs = params.toString();
  return getJSON(`${SITE_BASE}/teams/${teamId}/schedule${qs ? `?${qs}` : ""}`);
}

export function getRoster(teamId = TEAM_ID) {
  return getJSON(`${SITE_BASE}/teams/${teamId}/roster`);
}

export function getSummary(eventId) {
  return getJSON(`${SITE_BASE}/summary?event=${eventId}`);
}

export function getDivisionStandings(season, groupId = DIVISION_GROUP_ID) {
  return getJSON(`${CORE_BASE}/seasons/${season}/types/2/groups/${groupId}/standings/0`);
}

// Core API responses hand back $ref pointers (http://, not https://) that need a follow-up fetch.
export function resolveRef(ref) {
  return getJSON(ref.replace(/^http:/, "https:"));
}

export const SEASON_TYPE_LABEL = { 1: "PRE", 2: "REG", 3: "POST" };
