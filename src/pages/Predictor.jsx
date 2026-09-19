import { useState } from 'react';
import { PREDICTOR, NEXT_GAME } from '../data/current.js';
import LineTrendChart from '../components/LineTrendChart.jsx';

const STAT_LABELS = {
  passing_yards: 'Passing Yards',
  rushing_yards: 'Rushing Yards',
  receiving_yards: 'Receiving Yards',
  receptions: 'Receptions',
};
const STAT_UNITS = {
  passing_yards: 'yards',
  rushing_yards: 'yards',
  receiving_yards: 'yards',
  receptions: 'receptions',
};

function formatLine(edge) {
  const unit = STAT_UNITS[edge.statID];
  return unit ? `${edge.line} ${unit}` : edge.line ?? '—';
}

// Line + odds (only when O/U actually differ -- usually don't) + a movement arrow, all in one
// compact cell rather than three separate columns -- the grouped table below is trying to read as
// a quick scan, not a full odds slip.
function formatLineCell(e) {
  const oddsPart = e.overOdds !== e.underOdds ? ` (O ${e.overOdds ?? '—'}/U ${e.underOdds ?? '—'})` : '';
  const moved = e.openLine != null && String(e.openLine) !== String(e.line);
  const arrow = moved ? (Number(e.line) > Number(e.openLine) ? ' ▲' : ' ▼') : '';
  return `${formatLine(e)}${oddsPart}${arrow}`;
}

function formatSpread(team, value) {
  if (value == null) return '—';
  return `${team ?? ''} ${value > 0 ? '+' : ''}${value}`.trim();
}

function formatHistoryDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// oddsHistory[].spread is ESPN's raw HOME-relative figure, so it can't be combined with
// spreadTeam directly (SEA away + favored stored as +3.5 rendered as "SEA +3.5"). spreadTeam is
// the favorite parsed from odds.details, so the Seattle-perspective value is derivable per snapshot.
function seaSpread(h) {
  if (h.spread == null) return null;
  return h.spreadTeam === 'SEA' ? -Math.abs(h.spread) : Math.abs(h.spread);
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Vegas implied score: total split by the margin. Pure math on the posted line, not a pick.
function impliedScore(odds, oppAbbr) {
  if (odds?.spread == null || odds?.overUnder == null) return null;
  const margin = Math.abs(odds.spread);
  const fav = (odds.overUnder + margin) / 2;
  const dog = (odds.overUnder - margin) / 2;
  const seaFav = odds.spreadTeam === 'SEA';
  return { sea: seaFav ? fav : dog, opp: seaFav ? dog : fav, oppAbbr: oppAbbr ?? 'OPP' };
}

// Opening (first snapshot) vs. now, so a second move just re-evaluates against the same open.
// Only surfaces when something moved >= 1 point -- half-point noise isn't worth a strip.
function computeMovement(history) {
  const snaps = history
    .filter((h) => h.spread != null || h.overUnder != null)
    .map((h) => ({ at: h.capturedAt, spread: seaSpread(h), total: h.overUnder }));
  if (snaps.length < 2) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const prev = snaps[snaps.length - 2];

  const spreadMoved = first.spread != null && last.spread != null
    && Math.abs(last.spread - first.spread) >= 1;
  const totalMoved = first.total != null && last.total != null
    && Math.abs(last.total - first.total) >= 1;
  if (!spreadMoved && !totalMoved) return null;

  const flipped = spreadMoved && Math.sign(first.spread) !== Math.sign(last.spread);
  const adjectives = [];
  if (spreadMoved && !flipped) {
    adjectives.push(Math.abs(last.spread) < Math.abs(first.spread) ? 'tighter' : 'more lopsided');
  }
  if (totalMoved) adjectives.push(last.total < first.total ? 'lower-scoring' : 'higher-scoring');

  const since = formatHistoryDate(first.at);
  let sentence = flipped
    ? `Bettors flipped: Seattle is now ${last.spread > 0 ? 'the underdog' : 'the favorite'} versus the ${since} line.`
    : `Bettors are predicting a ${adjectives.join(', ')} game than they did on ${since}.`;

  const movedAgain = (prev.spread != null && last.spread != null && Math.abs(last.spread - prev.spread) >= 1)
    || (prev.total != null && last.total != null && Math.abs(last.total - prev.total) >= 1);
  if (movedAgain) {
    sentence += ' It moved again since yesterday.';
  } else {
    // A mid-week swing beyond both endpoints (open or now) by >= 1 point that later reversed.
    let swing = null;
    for (const s of snaps.slice(1, -1)) {
      for (const [key, label] of [['total', 'total'], ['spread', 'spread']]) {
        if (s[key] == null || first[key] == null || last[key] == null) continue;
        const lo = Math.min(first[key], last[key]);
        const hi = Math.max(first[key], last[key]);
        const over = Math.max(lo - s[key], s[key] - hi);
        if (over >= 1 && (!swing || over > swing.over)) swing = { over, label, at: s.at, value: s[key] };
      }
    }
    if (swing) {
      sentence += ` The ${swing.label} briefly hit ${swing.label === 'spread' ? formatSpread('SEA', swing.value) : fmtNum(swing.value)} on ${formatHistoryDate(swing.at)}.`;
    }
  }

  return {
    since,
    spreadChip: spreadMoved
      ? { from: first.spread, to: last.spread, down: Math.abs(last.spread) < Math.abs(first.spread) }
      : null,
    totalChip: totalMoved ? { from: first.total, to: last.total, down: last.total < first.total } : null,
    sentence,
  };
}

// The game-level line/total, kept separate from the player props below (different source --
// nextGame.odds comes from ESPN's pickcenter, not SportsGameOdds -- see docs/data-schema.md).
// Just the current line by default -- the chart + daily history table that used to render inline
// here (per user feedback, too much look/feel for a number that mostly doesn't change day to day)
// now live in a collapsed <details> so they're still there when actually wanted, without adding
// visual weight to the default view.
function GameLineCard() {
  if (!NEXT_GAME) return null;

  const odds = NEXT_GAME.odds;
  const history = NEXT_GAME.oddsHistory ?? [];
  const spreadPoints = history
    .filter((h) => h.spread != null)
    .map((h) => ({ x: h.capturedAt, y: seaSpread(h) }));
  const totalPoints = history
    .filter((h) => h.overUnder != null)
    .map((h) => ({ x: h.capturedAt, y: h.overUnder }));
  const hasTrend = spreadPoints.length >= 2 || totalPoints.length >= 2;
  const movement = computeMovement(history);
  const implied = impliedScore(odds, NEXT_GAME.opponent?.abbr);
  const chipStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 13 };

  return (
    <div className="card">
      <h2>Game Line</h2>
      {!odds ? (
        <p className="muted">No line posted yet for {NEXT_GAME.opponent?.name ?? 'the next game'}.</p>
      ) : (
        <>
          <div style={{ margin: '4px 0', fontSize: 14 }}>
            {odds.details}
            {odds.overUnder != null && <> · O/U {odds.overUnder}</>}
            {odds.moneyline?.sea != null && <> · SEA {odds.moneyline.sea > 0 ? '+' : ''}{odds.moneyline.sea}</>}
            {odds.provider && <span className="muted"> ({odds.provider})</span>}
          </div>

          {implied && (
            <div style={{ fontSize: 13, margin: '2px 0 0' }}>
              <span className="muted">Vegas implied score:</span>{' '}
              <strong className="tabnum">SEA {fmtNum(implied.sea)} – {implied.oppAbbr} {fmtNum(implied.opp)}</strong>
            </div>
          )}

          {movement && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: 11, letterSpacing: '0.06em', marginBottom: 8 }}>
                LINE MOVEMENT SINCE {movement.since.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {movement.spreadChip && (
                  <div style={chipStyle}>
                    <span className="muted">Spread</span>{' '}
                    <strong className="tabnum">
                      {formatSpread('SEA', movement.spreadChip.from)} → {fmtNum(movement.spreadChip.to)}
                    </strong>{' '}
                    <span style={{ color: 'var(--accent)' }} aria-label={movement.spreadChip.down ? 'tighter' : 'wider'}>
                      {movement.spreadChip.down ? '▼' : '▲'}
                    </span>
                  </div>
                )}
                {movement.totalChip && (
                  <div style={chipStyle}>
                    <span className="muted">Total</span>{' '}
                    <strong className="tabnum">{fmtNum(movement.totalChip.from)} → {fmtNum(movement.totalChip.to)}</strong>{' '}
                    <span style={{ color: 'var(--accent)' }} aria-label={movement.totalChip.down ? 'lower' : 'higher'}>
                      {movement.totalChip.down ? '▼' : '▲'}
                    </span>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.5 }}>{movement.sentence}</p>
            </div>
          )}

          {history.length > 1 && (
            <details style={{ marginTop: 12 }}>
              <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                Line history ({history.length} days)
              </summary>
              <div style={{ marginTop: 10 }}>
                {hasTrend && (
                  <div className="chart-row">
                    {spreadPoints.length >= 2 && (
                      <LineTrendChart label="Spread" points={spreadPoints} formatValue={(p) => formatSpread('SEA', p.y)} />
                    )}
                    {totalPoints.length >= 2 && (
                      <LineTrendChart label="Over/Under" points={totalPoints} formatValue={(p) => p.y} />
                    )}
                  </div>
                )}
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Date</th><th>Spread</th><th>O/U</th></tr></thead>
                    <tbody>
                      {[...history].reverse().map((h) => (
                        <tr key={h.capturedAt}>
                          <td className="muted">{formatHistoryDate(h.capturedAt)}</td>
                          <td className="tabnum">{formatSpread('SEA', seaSpread(h))}</td>
                          <td className="tabnum">{h.overUnder ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

const RESULT_LABEL = { cover: 'Cover', 'no-cover': 'No cover', push: 'Push' };
const RESULT_COLOR = { cover: 'var(--good)', 'no-cover': 'var(--critical)', push: 'var(--muted)' };

// Graded by fetch-live-score.mjs the instant a game goes final, against the last recorded line
// before kickoff (an approximation of the true closing line -- see docs/data-schema.md). Starts
// accumulating from whenever this feature shipped; no retroactive grading of earlier games.
// Hidden entirely (not just an empty state) until at least one game has been graded -- an
// all-zero record with an empty history table is clutter, not information, on a page a fan
// might visit before the season has any results to show yet.
function AtsRecordCard() {
  const record = PREDICTOR.atsRecord ?? { wins: 0, losses: 0, pushes: 0 };
  const history = PREDICTOR.atsHistory ?? [];
  const hasGraded = record.wins + record.losses + record.pushes > 0;
  if (!hasGraded) return null;

  return (
    <div className="card">
      <h2>Against the Spread</h2>
      <p style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>
        {record.wins}-{record.losses}{record.pushes ? `-${record.pushes}` : ''}
      </p>
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Graded against each week's last recorded line before kickoff — not always the true
        closing line, since it's only updated once daily.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Wk</th><th>Opp</th><th>Line</th><th>Result</th><th>ATS</th></tr></thead>
          <tbody>
            {[...history].reverse().map((h) => (
              <tr key={h.eventId}>
                <td className="tabnum muted">{h.week ?? '—'}</td>
                <td>{h.opponent ?? '—'}</td>
                <td className="tabnum">{formatSpread(h.closingSpreadTeam, h.closingSpread)}</td>
                <td className="tabnum">{h.seaScore}-{h.oppScore}</td>
                <td style={{ fontWeight: 600, color: RESULT_COLOR[h.result] }}>{RESULT_LABEL[h.result] ?? h.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// SGO's marketName is "{Player Name} {Stat Label}" for full-game markets (period-specific ones
// insert "1st Quarter"/"1st Half"/etc in between instead, which is exactly why this only gets
// called for periodID === "game" markets -- the suffix-strip is only reliable there).
function playerNameFromMarket(e) {
  const label = STAT_LABELS[e.statID];
  if (label && e.marketName?.endsWith(label)) return e.marketName.slice(0, -label.length).trim();
  return e.marketName ?? e.playerId;
}

function groupByPlayer(edges) {
  const map = new Map();
  for (const e of edges) {
    if (!map.has(e.playerId)) {
      map.set(e.playerId, { playerId: e.playerId, name: playerNameFromMarket(e), side: e.side, markets: [], insight: null });
    }
    const g = map.get(e.playerId);
    g.markets.push(e);
    if (!g.insight && e.insight) g.insight = e.insight;
  }
  return [...map.values()];
}

const SIDE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sea', label: 'SEA' },
  { value: 'opponent', label: 'OPP' },
];

export default function Predictor() {
  const [sideFilter, setSideFilter] = useState('all');
  const allEdges = PREDICTOR.edges ?? [];
  const hasEdges = allEdges.length > 0;

  // Full-game markets are the default, readable view; quarter/half splits (a much larger and more
  // niche set once SGO started posting them) are opt-in below. Both respect the same side filter.
  const gameEdges = allEdges.filter((e) => e.periodID === 'game' && (sideFilter === 'all' || e.side === sideFilter));
  const splitEdges = allEdges.filter((e) => e.periodID !== 'game' && (sideFilter === 'all' || e.side === sideFilter));
  const playerGroups = groupByPlayer(gameEdges);

  return (
    <>
      <GameLineCard />
      <AtsRecordCard />

      <div className="card">
        <h2>Player Props</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>{PREDICTOR.disclaimer}</p>
        {!PREDICTOR.asOf ? (
          <div style={{ marginTop: 8 }}>
            <p>
              <strong>Not live yet.</strong> This page is wired up to render prop-line data, but
              nothing has been fetched — <code>scripts/fetch-props.mjs</code> needs a
              <code> SPORTSGAMEODDS_API_KEY</code> to run.
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              See docs/data-schema.md &quot;Known gaps&quot; for the full status.
            </p>
          </div>
        ) : !hasEdges ? (
          <p className="muted">
            Last checked {new Date(PREDICTOR.asOf).toLocaleString()} — no prop lines were available
            for the next game yet (common this far before kickoff).
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {SIDE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`filter-pill${sideFilter === f.value ? ' active' : ''}`}
                  onClick={() => setSideFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {playerGroups.map((g) => (
                <div key={g.playerId} style={{ borderTop: '1px solid var(--grid)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{g.name}</strong>
                    <span className="pill">{g.side === 'sea' ? 'SEA' : 'OPP'}</span>
                  </div>
                  <table className="tabnum" style={{ fontSize: 14, marginTop: 4 }}>
                    <tbody>
                      {g.markets.map((m) => (
                        <tr key={m.statID}>
                          <td className="muted" style={{ padding: '2px 10px 2px 0' }}>{STAT_LABELS[m.statID] ?? m.statID}</td>
                          <td style={{ padding: '2px 10px 2px 0' }}>{formatLineCell(m)}</td>
                          <td className="muted" style={{ padding: '2px 0' }}>
                            {m.bookmaker === 'sportsgameodds' ? 'Consensus' : m.bookmaker}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {g.insight && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{g.insight}</p>}
                </div>
              ))}
              {playerGroups.length === 0 && (
                <p className="muted">No full-game props match this filter.</p>
              )}
            </div>

            {splitEdges.length > 0 && (
              <details style={{ marginTop: 16 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Show quarter/half splits ({splitEdges.length} markets)
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                  {splitEdges.map((e) => (
                    <div key={`${e.statID}-${e.playerId}-${e.periodID}-${e.betTypeID}`} style={{ borderTop: '1px solid var(--grid)', paddingTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <strong>{e.marketName ?? `${e.playerId} ${e.statID}`}</strong>
                        <span className="pill">{e.side === 'sea' ? 'SEA' : 'OPP'}</span>
                      </div>
                      <div className="tabnum" style={{ margin: '4px 0', fontSize: 14 }}>
                        {formatLineCell(e)}
                        <span className="muted"> ({e.bookmaker === 'sportsgameodds' ? 'Consensus' : e.bookmaker})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}
