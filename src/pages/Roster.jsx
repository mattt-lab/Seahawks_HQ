import { ROSTER, INJURIES } from '../data/current.js';

const GROUP_LABELS = {
  offense: 'Offense',
  defense: 'Defense',
  specialTeam: 'Special Teams',
  injuredReserveOrOut: 'Injured Reserve / Out',
  suspended: 'Suspended',
  practiceSquad: 'Practice Squad',
};

export default function Roster() {
  return (
    <>
      <div className="card">
        <h2>Current Injury Report</h2>
        {INJURIES.report.length === 0 ? (
          <p className="muted">No injuries currently reported.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Player</th><th>Pos</th><th>Status</th><th>Body Part</th></tr>
              </thead>
              <tbody>
                {INJURIES.report.map((i) => (
                  <tr key={i.playerId ?? i.name}>
                    <td>{i.name}</td>
                    <td className="muted">{i.position}</td>
                    <td>{i.status}</td>
                    <td className="muted">{i.bodyPart ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Source: Sleeper.</p>
      </div>

      {ROSTER.groups
        .filter((g) => g.players.length > 0)
        .map((g, i) => (
          <div className="card" key={g.position}>
            <h2>{GROUP_LABELS[g.position] ?? g.position}</h2>
            {i === 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 10 }}>
                <span className="starter-dot" style={{ marginRight: 5 }} />Bold = current starter, per ESPN's depth chart
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Player</th><th>Pos</th><th>Age</th><th>Exp</th></tr>
                </thead>
                <tbody>
                  {g.players.map((p) => (
                    <tr key={p.id}>
                      <td className="tabnum muted">{p.jersey ?? '—'}</td>
                      <td style={p.starter ? { fontWeight: 700 } : undefined}>
                        {p.starter && <span className="starter-dot" title="Starter" />}
                        {p.name}
                      </td>
                      <td className="muted">{p.pos}</td>
                      <td className="tabnum">{p.age ?? '—'}</td>
                      <td className="tabnum">{p.experience ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}
