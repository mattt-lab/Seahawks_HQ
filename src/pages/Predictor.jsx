import { PREDICTOR } from '../data/current.js';

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

export default function Predictor() {
  const hasEdges = PREDICTOR.edges && PREDICTOR.edges.length > 0;

  return (
    <div className="card">
      <h2>Predictor / Insights Hub</h2>
      <p className="muted" style={{ fontSize: 13 }}>{PREDICTOR.disclaimer}</p>

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
  );
}
