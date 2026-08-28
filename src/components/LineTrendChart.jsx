import { useState } from 'react';

// Single-series SVG line chart -- no charting library (the project deliberately has none; see
// git history). One accent-colored line per chart by design: two different-scale measures (e.g.
// spread vs. over/under) always get two separate <LineTrendChart>s side by side, never one chart
// with two y-axes.
const W = 300;
const H = 120;
const PAD = { top: 12, right: 12, bottom: 20, left: 12 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function shortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// formatValue receives the whole point (not just .y) so callers can fold in extra per-point
// fields -- e.g. the spread chart needs which team was favored, and that can change point to
// point, so it travels on the point itself rather than as a single chart-level label.
export default function LineTrendChart({ label, points, formatValue = (p) => String(p.y) }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!points || points.length === 0) return null;

  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = Math.max(range * 0.2, 0.5);
  const yMin = min - pad;
  const yMax = max + pad;

  const xAt = (i) => (points.length === 1 ? PAD.left + INNER_W / 2 : PAD.left + (i / (points.length - 1)) * INNER_W);
  const yAt = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * INNER_H;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.y)}`).join(' ');
  const lastIndex = points.length - 1;
  const active = hoverIndex ?? lastIndex;
  const activePoint = points[active];

  function indexFromClientX(el, clientX) {
    const rect = el.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const i = Math.round(frac * (points.length - 1));
    return Math.min(points.length - 1, Math.max(0, i));
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
        role="img"
        aria-label={`${label} trend: ${points.map((p) => `${shortDate(p.x)} ${formatValue(p)}`).join(', ')}`}
        tabIndex={0}
        onPointerMove={(e) => setHoverIndex(indexFromClientX(e.currentTarget, e.clientX))}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHoverIndex(Math.max(0, active - 1));
          if (e.key === 'ArrowRight') setHoverIndex(Math.min(lastIndex, active + 1));
        }}
        onBlur={() => setHoverIndex(null)}
      >
        {/* Baseline gridline -- recessive, hairline, solid (never dashed). */}
        <line x1={PAD.left} x2={W - PAD.right} y1={yAt((yMin + yMax) / 2)} y2={yAt((yMin + yMax) / 2)} stroke="var(--grid)" strokeWidth="1" />

        {points.length > 1 && (
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Crosshair -- vertical hairline that snaps to the nearest data point on hover/focus. */}
        {hoverIndex !== null && (
          <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ink-2)" strokeWidth="1" opacity="0.35" />
        )}

        {/* End marker: >=8px, 2px surface ring so it stays legible crossing the line. */}
        <circle cx={xAt(lastIndex)} cy={yAt(points[lastIndex].y)} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />
        {hoverIndex !== null && hoverIndex !== lastIndex && (
          <circle cx={xAt(hoverIndex)} cy={yAt(points[hoverIndex].y)} r="4" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />
        )}

        {/* Direct label on the endpoint -- text tokens, never the series color. */}
        <text x={xAt(lastIndex)} y={yAt(points[lastIndex].y) - 8} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--ink-1)">
          {formatValue(points[lastIndex])}
        </text>

        <text x={PAD.left} y={H - 4} fontSize="10" fill="var(--muted)">{shortDate(points[0].x)}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize="10" fill="var(--muted)">{shortDate(points[lastIndex].x)}</text>
      </svg>

      {hoverIndex !== null && (
        <div
          style={{
            position: 'absolute', pointerEvents: 'none', whiteSpace: 'nowrap',
            background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '3px 8px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            left: `${(xAt(hoverIndex) / W) * 100}%`,
            top: `${(yAt(activePoint.y) / H) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          <span className="muted">{shortDate(activePoint.x)}</span>{' '}
          <strong className="tabnum">{formatValue(activePoint)}</strong>
        </div>
      )}
    </div>
  );
}
