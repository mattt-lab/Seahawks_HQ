import { SCHEDULE, STANDINGS, formatRecord } from '../data/current.js';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function Schedule() {
  return (
    <>
      <div className="card">
        <h2>{STANDINGS.division} Standings</h2>
        <table>
          <thead>
            <tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>PCT</th><th>GB</th><th>Streak</th></tr>
          </thead>
          <tbody>
            {STANDINGS.entries.map((e) => (
              <tr key={e.teamId} style={e.abbr === 'SEA' ? { fontWeight: 700 } : undefined}>
                <td>{e.abbr}</td>
                <td className="tabnum">{e.wins}</td>
                <td className="tabnum">{e.losses}</td>
                <td className="tabnum">{e.ties}</td>
                <td className="tabnum">{e.winPercent?.toFixed(3)}</td>
                <td className="tabnum">{e.gamesBehind}</td>
                <td className="tabnum">{e.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Full Regular-Season Schedule</h2>
        <table>
          <thead>
            <tr><th>Wk</th><th>Date</th><th>Opponent</th><th>Opp. Record</th><th>Result</th></tr>
          </thead>
          <tbody>
            {SCHEDULE.map((g) => (
              <tr key={g.eventId} className={g.result ? `result-${g.result}` : undefined}>
                <td className="tabnum">{g.week}</td>
                <td className="muted">{formatDate(g.date)}</td>
                <td>{g.homeAway === 'home' ? 'vs' : '@'} {g.opponent?.abbr}</td>
                <td className="muted tabnum">{g.opponentRecord ? formatRecord(g.opponentRecord) : '—'}</td>
                <td className="result tabnum">
                  {g.status === 'scheduled' && <span className="muted">—</span>}
                  {g.status !== 'scheduled' && `${g.result ?? ''} ${g.seaScore ?? ''}-${g.oppScore ?? ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Opponent records reflect their most recent fetch, not a point-in-time snapshot — see
          docs/data-schema.md for why (and the current preseason-vs-regular-season caveat).
        </p>
      </div>
    </>
  );
}
