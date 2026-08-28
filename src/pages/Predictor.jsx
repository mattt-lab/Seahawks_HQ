import { PREDICTOR, NEXT_GAME } from '../data/current.js';
import LineTrendChart from '../components/LineTrendChart.jsx';

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

function formatSpread(team, value) {
  if (value == null) return '—';
  return `${team ?? ''} ${value > 0 ? '+' : ''}${value}`.trim();
}

function formatHistoryDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The game-level line/total, kept separate from the player props below (different source --
// nextGame.odds comes from ESPN's pickcenter, not SportsGameOdds -- see docs/data-schema.md).
// oddsHistory is a real time series (one point per pipeline run), so a spread/total swing is
// visible as a trend, not just a single current number.
function GameLineCard() {
  if (!NEXT_GAME) return null;

  const odds = NEXT_GAME.odds;
  const history = NEXT_GAME.oddsHistory ?? [];
  const spreadPoints = history
    .filter((h) => h.spread != null)
    .map((h) => ({ x: h.capturedAt, y: h.spread, team: h.spreadTeam }));
  const totalPoints = history
    .filter((h) => h.overUnder != null)
    .map((h) => ({ x: h.capturedAt, y: h.overUnder }));
  const hasTrend = spreadPoints.length >= 2 || totalPoints.length >= 2;

  return (
    <div className="card">
      <h2>Game Line</h2>
      {!odds ? (
        <p className="muted">No line posted yet for {NEXT_GAME.opponent?.name ?? 'the next game'}.</p>
      ) : (
        <>
          <div style={{ margin: '4px 0 12px', fontSize: 14 }}>
            {odds.details}
            {odds.overUnder != null && <> · O/U {odds.overUnder}</>}
            {odds.moneyline?.sea != null && <> · SEA {odds.moneyline.sea > 0 ? '+' : ''}{odds.moneyline.sea}</>}
            {odds.provider && <span className="muted"> ({odds.provider})</span>}
          </div>

          {hasTrend ? (
            <div className="chart-row">
              {spreadPoints.length >= 2 && (
                <LineTrendChart label="Spread" points={spreadPoints} formatValue={(p) => formatSpread(p.team, p.y)} />
              )}
              {totalPoints.length >= 2 && (
                <LineTrendChart label="Over/Under" points={totalPoints} formatValue={(p) => p.y} />
              )}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              Only one snapshot so far — check back through the week to see how the line moves.
            </p>
          )}

          {history.length > 1 && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Date</th><th>Spread</th><th>O/U</th></tr></thead>
                <tbody>
                  {[...history].reverse().map((h) => (
                    <tr key={h.capturedAt}>
                      <td className="muted">{formatHistoryDate(h.capturedAt)}</td>
                      <td className="tabnum">{formatSpread(h.spreadTeam, h.spread)}</td>
                      <td className="tabnum">{h.overUnder ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Predictor() {
  const hasEdges = PREDICTOR.edges && PREDICTOR.edges.length > 0;

  return (
    <>
      <div className="card">
        <h2>Predictor / Insights Hub</h2>
        <p className="muted" style={{ fontSize: 13 }}>{PREDICTOR.disclaimer}</p>
      </div>

      <GameLineCard />

      <div className="card">
        <h2>Player Props</h2>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {PREDICTOR.edges.map((e) => (
              <div key={`${e.statID}-${e.playerId}`} style={{ borderTop: '1px solid var(--grid)', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{e.marketName ?? `${e.playerId} ${e.statID}`}</strong>
                  <span className="pill">{e.side === 'sea' ? 'SEA' : 'OPP'}</span>
                </div>
                <div className="tabnum" style={{ margin: '4px 0', fontSize: 14 }}>
                  {formatLine(e)}
                  {e.overOdds !== e.underOdds && (
                    <>{' · '}O {e.overOdds ?? '—'}{' · '}U {e.underOdds ?? '—'}</>
                  )}
                  <span className="muted"> ({e.bookmaker === 'sportsgameodds' ? 'Consensus' : e.bookmaker})</span>
                </div>
                {e.insight && <p style={{ margin: '4px 0 0', fontSize: 14 }}>{e.insight}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
