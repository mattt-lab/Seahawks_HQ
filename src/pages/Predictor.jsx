import { PREDICTOR } from '../data/current.js';

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
            <table>
              <thead>
                <tr><th>Market</th><th>Side</th><th>Line</th><th>Odds</th><th>Book</th></tr>
              </thead>
              <tbody>
                {PREDICTOR.edges.map((e) => (
                  <tr key={e.oddID}>
                    <td>{e.marketName ?? e.oddID}</td>
                    <td className="muted">{e.sideID}</td>
                    <td className="tabnum">{e.line ?? '—'}</td>
                    <td className="tabnum">{e.odds ?? '—'}</td>
                    <td className="muted">{e.bookmaker === 'sportsgameodds' ? 'Consensus' : e.bookmaker}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Raw lines only — no edge/trend comparison yet. &quot;Consensus&quot; means no
              individual sportsbook had posted its own line yet (common for backup-player props
              this far before kickoff); SportsGameOdds' own fair-value line is shown instead.
            </p>
          </>
        )}
      </div>
    </>
  );
}
