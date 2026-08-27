import { FRANCHISE } from '../data/current.js';

export default function Franchise() {
  return (
    <>
      {FRANCHISE._note && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{FRANCHISE._note}</p>
        </div>
      )}

      <div className="card">
        <h2>Ring of Honor</h2>
        <ul>
          {FRANCHISE.ringOfHonor.map((r) => (
            <li key={r.name}>{r.name}{r.inducted ? ` (inducted ${r.inducted})` : ''}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Retired Numbers</h2>
        <ul>
          {FRANCHISE.retiredNumbers.map((r) => (
            <li key={r.number}><strong>#{r.number}</strong> — {r.note}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Notable Moments</h2>
        <ul>
          {FRANCHISE.notableMoments.map((m, i) => (
            <li key={i}><strong>{m.year}</strong> — {m.text}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
