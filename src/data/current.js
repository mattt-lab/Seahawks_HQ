// Loads data/current.json (written by scripts/fetch-*.mjs) and data/franchise.json (hand-
// maintained). See docs/data-schema.md for the authoritative schema this targets.
import raw from '../../data/current.json';
import franchiseRaw from '../../data/franchise.json';

export const TEAM_ID = raw.meta.teamId;
export const SEASON = raw.meta.season;
export const SEASON_TYPE = raw.meta.seasonType;
export const WEEK = raw.meta.week;
export const LAST_UPDATED = raw.meta.lastUpdated;

export const RECORD = raw.record;
export const STANDINGS = raw.standings;
export const NEXT_GAME = raw.nextGame;
export const SCHEDULE = raw.schedule;
export const ROSTER = raw.roster;
export const INJURIES = raw.injuries;
export const PREDICTOR = raw.predictor;

export const FRANCHISE = franchiseRaw;

export function formatRecord(r) {
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

export function seasonTypeLabel(code) {
  if (code === 'PRE') return 'Preseason';
  if (code === 'REG') return 'Regular Season';
  if (code === 'POST') return 'Postseason';
  return code;
}
