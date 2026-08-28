// Stage 1 (data): populates everything in data/current.json except `injuries` (fetch-injuries.mjs),
// `predictor` (fetch-props.mjs), and `nextGame.whatToWatch`/`nextGame.recap` (narrate.mjs). Those
// scripts read-modify-write the same file, so run order only matters in that each script tolerates
// running before this one has ever run (falls back to sane empty shells).
import {
  TEAM_ID,
  getTeam,
  getSchedule,
  getRoster,
  getSummary,
  getDivisionStandings,
  getTeamStatistics,
  getDepthChart,
  resolveRef,
  SEASON_TYPE_LABEL,
} from "./lib/espn.mjs";
import { readCurrent, writeCurrent } from "./lib/io.mjs";
import { VENUES } from "./lib/venues.mjs";
import { getKickoffWeather } from "./lib/weather.mjs";

function recordSplit(items, type) {
  const item = items.find((i) => i.type === type);
  if (!item) return null;
  const stats = Object.fromEntries(item.stats.map((s) => [s.name, s.value]));
  return stats;
}

async function buildRecord(team) {
  const items = team.record?.items ?? [];
  const overall = recordSplit(items, "total") ?? {};
  const home = recordSplit(items, "home") ?? {};
  const road = recordSplit(items, "road") ?? {};
  return {
    overall: {
      wins: overall.wins ?? 0,
      losses: overall.losses ?? 0,
      ties: overall.ties ?? 0,
      winPercent: overall.winPercent ?? 0,
      streak: overall.streak ?? 0,
      pointDifferential: overall.pointDifferential ?? 0,
      playoffSeed: overall.playoffSeed ?? null,
      avgPointsAgainst: overall.avgPointsAgainst ?? null,
      avgPointsFor: overall.avgPointsFor ?? null,
    },
    home: { wins: home.wins ?? 0, losses: home.losses ?? 0, ties: home.ties ?? 0 },
    road: { wins: road.wins ?? 0, losses: road.losses ?? 0, ties: road.ties ?? 0 },
  };
}

async function buildStandings(season) {
  const body = await getDivisionStandings(season);
  const entries = await Promise.all(
    body.standings.map(async (s) => {
      const [team, record] = await Promise.all([
        resolveRef(s.team.$ref),
        resolveRef(s.records[0].$ref),
      ]);
      const stats = Object.fromEntries(record.stats.map((x) => [x.name, x.value]));
      return {
        teamId: team.id,
        abbr: team.abbreviation,
        wins: stats.wins ?? 0,
        losses: stats.losses ?? 0,
        ties: stats.ties ?? 0,
        winPercent: stats.winPercent ?? 0,
        gamesBehind: stats.gamesBehind ?? 0,
        streak: stats.streak ?? 0,
        pointDifferential: stats.pointDifferential ?? 0,
      };
    })
  );
  entries.sort((a, b) => b.winPercent - a.winPercent);
  return { division: "NFC West", groupId: "3", asOf: new Date().toISOString(), entries };
}

function mapCompetitor(competitors, teamId) {
  return competitors.find((c) => c.team?.id === teamId);
}

// ESPN's own shortName for its streaming tier is literally "ESPN Unlmtd" -- not a typo on our
// end, just an odd display choice worth cleaning up.
function cleanBroadcastName(name) {
  return name?.replace(/\s+Unlmtd$/i, "") ?? name;
}

// Deliberately NOT "yards allowed" -- ESPN's team-statistics endpoint only exposes a team's OWN
// offensive production per category (passing/rushing/receiving), plus a "defensive" category that
// is tackles/sacks/INTs, not yards-allowed. avgPointsAgainst (from the team record endpoint,
// already fetched elsewhere for `record`) is the closest real "how good is this defense" figure
// available without a new data source; sacksPerGame adds a pressure-rate angle. Both are real,
// neither is "yards allowed vs this specific stat," which doesn't exist in any source spiked yet.
async function buildDefenseContext(teamId, prefetchedTeam) {
  const [team, statsBody] = await Promise.all([
    prefetchedTeam ? Promise.resolve(prefetchedTeam) : getTeam(teamId),
    getTeamStatistics(teamId),
  ]);
  const overall = recordSplit(team.record?.items ?? [], "total") ?? {};
  const defCategory = statsBody.results?.stats?.categories?.find((c) => c.name === "defensive");
  const sacks = defCategory?.stats?.find((s) => s.name === "sacks");
  return {
    avgPointsAgainst: overall.avgPointsAgainst ?? null,
    sacksPerGame: sacks?.perGameValue ?? null,
  };
}

async function buildScheduleAndNextGame(season, seaTeam) {
  // Unfiltered fetch = whatever ESPN currently considers "live" (could be PRE/REG/POST) -- used
  // only to find the next game. The Season Tracker's `schedule[]` below always wants the real
  // 17-game regular season regardless, hence the separate seasonType: 2 fetch.
  const live = await getSchedule({ season });
  const liveEvents = [...(live.events ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const upcoming = liveEvents.find((e) => !e.competitions?.[0]?.status?.type?.completed);
  const nextEvent = upcoming ?? liveEvents[liveEvents.length - 1] ?? null;

  let nextGame = null;
  if (nextEvent) {
    const comp = nextEvent.competitions[0];
    const us = mapCompetitor(comp.competitors, TEAM_ID);
    const opp = comp.competitors.find((c) => c.team?.id !== TEAM_ID);
    const summary = await getSummary(nextEvent.id);
    const pick = summary.pickcenter?.[0];
    const seaInjuries = summary.injuries?.find((t) => t.team?.abbreviation === "SEA");
    const oppInjuries = summary.injuries?.find((t) => t.team?.abbreviation !== "SEA");
    const [seaDefense, oppDefense] = await Promise.all([
      buildDefenseContext(TEAM_ID, seaTeam),
      opp?.team?.id ? buildDefenseContext(opp.team.id) : Promise.resolve(null),
    ]);

    // Weather: only for genuinely open-air stadiums (see lib/venues.mjs for what counts), and
    // only when Open-Meteo's ~16-day forecast window actually reaches this kickoff yet.
    const hostAbbr = us?.homeAway === "home" ? "SEA" : opp?.team?.abbreviation;
    const hostVenue = hostAbbr ? VENUES[hostAbbr] : null;
    let weather = null;
    if (hostVenue && !hostVenue.indoor) {
      try {
        weather = await getKickoffWeather({ lat: hostVenue.lat, lon: hostVenue.lon, kickoffIso: nextEvent.date });
      } catch (err) {
        console.error("Weather fetch failed, leaving null:", err.message);
      }
    }

    nextGame = {
      eventId: nextEvent.id,
      week: nextEvent.week?.number ?? null,
      seasonType: SEASON_TYPE_LABEL[nextEvent.seasonType?.type] ?? "UNKNOWN",
      date: nextEvent.date,
      homeAway: us?.homeAway ?? null,
      opponent: opp?.team
        ? { id: opp.team.id, abbr: opp.team.abbreviation, name: opp.team.displayName }
        : null,
      venue: comp.venue
        ? {
            name: comp.venue.fullName,
            city: comp.venue.address?.city ?? null,
            state: comp.venue.address?.state ?? null,
            surface: comp.venue.grass === undefined ? null : comp.venue.grass ? "grass" : "turf",
            indoor: hostVenue?.indoor ?? null,
          }
        : null,
      // null for indoor venues (deliberately not fetched -- weather doesn't matter there), or for
      // an outdoor venue whose kickoff is further out than Open-Meteo's ~16-day forecast window.
      weather,
      broadcast: summary.broadcasts?.[0]?.media?.shortName
        ? summary.broadcasts.map((b) => cleanBroadcastName(b.media?.shortName)).filter(Boolean)
        : null,
      odds: pick
        ? {
            provider: pick.provider?.name ?? null,
            spread: pick.spread ?? null,
            spreadTeam: pick.details?.split(" ")[0] ?? null,
            details: pick.details ?? null,
            overUnder: pick.overUnder ?? null,
            moneyline: {
              sea: (us?.homeAway === "home" ? pick.homeTeamOdds : pick.awayTeamOdds)?.moneyLine ?? null,
              opp: (us?.homeAway === "home" ? pick.awayTeamOdds : pick.homeTeamOdds)?.moneyLine ?? null,
            },
          }
        : null,
      // Filled in below, once `schedule` exists -- deliberately scoped down from "full head-to-
      // head history" (no source for that) to just "did we already play this exact opponent
      // earlier THIS season" (division rivals play twice; that rematch is genuinely useful
      // context a fan would want, unlike an all-time record no source provides anyway).
      seriesHistory: null,
      // Feeds the Predictor Hub's insight text (fetch-props.mjs / narrate.mjs) -- see
      // buildDefenseContext()'s comment above for exactly what this is and isn't.
      defense: { sea: seaDefense, opponent: oppDefense },
      injuries: {
        sea: (seaInjuries?.injuries ?? []).map((i) => ({
          athleteId: i.athlete?.id ?? null,
          name: i.athlete?.fullName ?? null,
          position: i.athlete?.position?.abbreviation ?? null,
          status: i.status,
          bodyPart: i.details?.type ?? null,
          side: i.details?.side ?? null,
          returnDate: i.details?.returnDate ?? null,
        })),
        opponent: (oppInjuries?.injuries ?? []).map((i) => ({
          athleteId: i.athlete?.id ?? null,
          name: i.athlete?.fullName ?? null,
          position: i.athlete?.position?.abbreviation ?? null,
          status: i.status,
          bodyPart: i.details?.type ?? null,
          side: i.details?.side ?? null,
          returnDate: i.details?.returnDate ?? null,
        })),
      },
      live: {
        status: comp.status?.type?.completed
          ? "final"
          : comp.status?.type?.state === "in"
            ? "in_progress"
            : "scheduled",
        awayScore: comp.competitors.find((c) => c.homeAway === "away")?.score?.value ?? null,
        homeScore: comp.competitors.find((c) => c.homeAway === "home")?.score?.value ?? null,
        period: null,
        clock: null,
        winProbability: null,
      },
    };
  }

  const regSeason = await getSchedule({ season, seasonType: 2 });
  const scheduleEvents = [...(regSeason.events ?? [])].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const opponentIds = [
    ...new Set(
      scheduleEvents
        .map((e) => e.competitions[0].competitors.find((c) => c.team?.id !== TEAM_ID)?.team?.id)
        .filter(Boolean)
    ),
  ];
  const opponentRecords = Object.fromEntries(
    await Promise.all(
      opponentIds.map(async (id) => {
        const t = await getTeam(id);
        const overall = recordSplit(t.record?.items ?? [], "total") ?? {};
        return [id, { wins: overall.wins ?? 0, losses: overall.losses ?? 0, ties: overall.ties ?? 0 }];
      })
    )
  );

  const schedule = scheduleEvents.map((e) => {
    const comp = e.competitions[0];
    const us = mapCompetitor(comp.competitors, TEAM_ID);
    const opp = comp.competitors.find((c) => c.team?.id !== TEAM_ID);
    const completed = comp.status?.type?.completed ?? false;
    return {
      eventId: e.id,
      week: e.week?.number ?? null,
      seasonType: SEASON_TYPE_LABEL[e.seasonType?.type] ?? "UNKNOWN",
      date: e.date,
      opponent: opp?.team
        ? { id: opp.team.id, abbr: opp.team.abbreviation, name: opp.team.displayName }
        : null,
      homeAway: us?.homeAway ?? null,
      venue: comp.venue?.fullName ?? null,
      broadcast: comp.broadcasts?.[0]?.media?.shortName
        ? comp.broadcasts.map((b) => cleanBroadcastName(b.media?.shortName)).filter(Boolean)
        : null,
      status: completed ? "final" : comp.status?.type?.state === "in" ? "in_progress" : "scheduled",
      result: completed ? (us?.winner ? "W" : "L") : null,
      seaScore: us?.score?.value ?? null,
      oppScore: opp?.score?.value ?? null,
      opponentRecord: opp?.team?.id ? (opponentRecords[opp.team.id] ?? null) : null,
    };
  });

  if (nextGame) {
    const rematch = nextGame.opponent?.id
      ? schedule.find(
          (g) => g.opponent?.id === nextGame.opponent.id && g.status === "final" && g.eventId !== nextGame.eventId
        )
      : null;
    nextGame.seriesHistory = rematch
      ? {
          playedEarlierThisSeason: true,
          week: rematch.week,
          result: rematch.result,
          seaScore: rematch.seaScore,
          oppScore: rematch.oppScore,
        }
      : { playedEarlierThisSeason: false };
  }

  return { nextGame, schedule };
}

// Set of athlete ids currently listed FIRST at any position across every depth-chart group
// (offense, "Base 3-4 D" defense, special teams). A position with only one athlete listed (e.g.
// kicker, punter, long snapper) still counts -- there's no depth competition to show, but that
// one player is still the starter. Multiple entries can share the same position abbreviation (WR
// has 3 separate slots) -- iterating every position entry rather than deduping by abbreviation is
// what correctly picks up all 3 starting receivers, not just one.
function buildStarterIds(depthChartBody) {
  const ids = new Set();
  for (const chart of depthChartBody.depthchart ?? []) {
    for (const pos of Object.values(chart.positions ?? {})) {
      const starterId = pos.athletes?.[0]?.id;
      if (starterId) ids.add(starterId);
    }
  }
  return ids;
}

async function main() {
  const team = await getTeam();
  const scheduleProbe = await getSchedule();
  const season = scheduleProbe.season?.year ?? new Date().getFullYear();

  const [record, standings, rosterBody, depthChartBody, { nextGame, schedule }] = await Promise.all([
    buildRecord(team),
    buildStandings(season),
    getRoster(),
    getDepthChart(),
    buildScheduleAndNextGame(season, team),
  ]);

  const starterIds = buildStarterIds(depthChartBody);

  const roster = {
    asOf: new Date().toISOString(),
    groups: (rosterBody.athletes ?? []).map((g) => ({
      position: g.position,
      players: (g.items ?? []).map((p) => ({
        id: p.id,
        name: p.displayName,
        pos: p.position?.abbreviation ?? null,
        jersey: p.jersey ?? null,
        age: p.age ?? null,
        experience: p.experience?.years ?? null,
        starter: starterIds.has(p.id),
      })),
    })),
  };

  const existing = await readCurrent();

  // Preserve whatToWatch/recap from narrate.mjs if they already exist for this SAME event --
  // a new opponent/eventId means those bullets are stale and must reset to empty.
  if (nextGame && existing?.nextGame?.eventId === nextGame.eventId) {
    nextGame.whatToWatch = existing.nextGame.whatToWatch ?? [];
    nextGame.recap = existing.nextGame.recap ?? { text: null, blurbSource: null };
  } else if (nextGame) {
    nextGame.whatToWatch = [];
    nextGame.recap = { text: null, blurbSource: null };
  }

  const next = {
    meta: {
      teamId: TEAM_ID,
      season,
      seasonType: nextGame?.seasonType ?? existing?.meta?.seasonType ?? "UNKNOWN",
      week: nextGame?.week ?? existing?.meta?.week ?? null,
      lastUpdated: new Date().toISOString(),
    },
    record,
    standings,
    nextGame,
    schedule,
    roster,
    // Owned by other scripts -- keep whatever's already there, or an empty shell if this is the
    // first run ever.
    injuries: existing?.injuries ?? { asOf: null, source: "sleeper", report: [] },
    predictor: existing?.predictor ?? {
      asOf: null,
      sgoEventId: null,
      disclaimer: "For entertainment/informational purposes only — not betting advice.",
      edges: [],
    },
  };

  await writeCurrent(next);
  console.log(
    `Wrote data/current.json — season ${season} ${next.meta.seasonType} wk${next.meta.week}, next: ${nextGame?.opponent?.name ?? "none found"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
