import { PREDICTOR } from '../data/current.js';

const STAT_LABELS = {
  passing_yards: 'Passing Yards',
  rushing_yards: 'Rushing Yards',
  receiving_yards: 'Receiving Yards',
  receptions: 'Receptions',
};

export default function Predictor() {
  const hasEdges = PREDICTOR.edges && PREDICTOR.edges.length > 0;

  return (
    <>
      <div className="card">
        <h2>Predictor / Insights Hub</h2>
        <p className="muted" style={{ fontSize: 13 }}>{PREDICTOR.disclaimer}</p>

        {!PREDICTOR.asOf ? (
          <div style={{ marginTop: 8 }}>
            <p>
              <strong>Not live yet.</strong> This page is wired up to render prop-line data, but
              nothing has been fetched — <code>scripts/fetch-props.mjs</code> needs a
              <code> SPORTSGAMEODDS_API_KEY</code> to run, and even once it does, it currently only
              pulls the raw prop lines (line, odds, bookmaker). The actual &quot;edge&quot; logic —
              comparing each line against a player&apos;s real recent-game trend — hasn&apos;t been
              built yet.
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
          <table>
            <thead>
              <tr><th>Player</th><th>Market</th><th>Line</th><th>Odds</th><th>Book</th></tr>
            </thead>
            <tbody>
              {PREDICTOR.edges.map((e) => (
                <tr key={e.oddID}>
                  <td className="muted">{e.playerId ?? e.oddID}</td>
                  <td>{STAT_LABELS[e.statID] ?? e.statID} ({e.sideID})</td>
                  <td className="tabnum">{e.line ?? '—'}</td>
                  <td className="tabnum">{e.odds ?? '—'}</td>
                  <td className="muted">{e.bookmaker}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
