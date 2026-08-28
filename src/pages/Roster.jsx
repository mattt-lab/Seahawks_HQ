import { useState } from 'react';
import { ROSTER, INJURIES } from '../data/current.js';

const GROUP_LABELS = {
  offense: 'Offense',
  defense: 'Defense',
  specialTeam: 'Special Teams',
  injuredReserveOrOut: 'Injured Reserve / Out',
  suspended: 'Suspended',
  practiceSquad: 'Practice Squad',
};

// Starters first (stable -- ties keep ESPN's own roster order), not just bolded in place. Applies
// regardless of the starters-only toggle, so the sort itself is useful even with the full roster
// showing.
function sortStartersFirst(players) {
  return [...players].sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
}

function formatChangeDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Roster() {
  const [startersOnly, setStartersOnly] = useState(false);
  const recentChanges = ROSTER.recentChanges ?? [];

  return (
    <>
      <div className="card">
        <h2>Depth Chart Moves</h2>
        {recentChanges.length === 0 ? (
          <p className="muted">No depth chart changes detected yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {recentChanges.map((c, i) => (
              <li
                key={`${c.slot}-${c.detectedAt}-${i}`}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}
              >
                <span>
                  <strong>{c.slot}</strong> <span className="muted">({c.group})</span>:{' '}
                  {c.previousStarter?.name ?? '—'} → {c.currentStarter.name}
                </span>
                <span className="muted tabnum" style={{ whiteSpace: 'nowrap' }}>
                  {formatChangeDate(c.detectedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

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

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={startersOnly} onChange={(e) => setStartersOnly(e.target.checked)} />
          Starters only
        </label>
        <span className="muted" style={{ fontSize: 12 }}>
          <span className="starter-dot" style={{ marginRight: 5 }} />Bold = current starter, per ESPN's depth chart
        </span>
      </div>

      {ROSTER.groups
        .map((g) => ({ ...g, players: sortStartersFirst(g.players).filter((p) => !startersOnly || p.starter) }))
        .filter((g) => g.players.length > 0)
        .map((g) => (
          <div className="card" key={g.position}>
            <h2>{GROUP_LABELS[g.position] ?? g.position}</h2>
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
