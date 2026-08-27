// Minimal stroke icons, no icon library -- matches the site's flat/understated visual language.
// currentColor so it inherits whatever text color it's placed in.
const ICONS = {
  sun: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.6 3.6l1.4 1.4M13 13l1.4 1.4M14.4 3.6L13 5M5 13l-1.4 1.4" />
    </>
  ),
  cloud: (
    <path d="M5.5 13.5a3.2 3.2 0 0 1-.3-6.4 4 4 0 0 1 7.7-1.3 3 3 0 0 1-.4 6.1 .6.6 0 0 1-.1 0h-6.9z" />
  ),
  cloudSun: (
    <>
      <circle cx="5" cy="5" r="2.2" />
      <path d="M5 1.2v1.3M5 8.4v.3M1.2 5h1.3M8.5 5h.2M2.1 2.1l.9.9M7.9 2.1l-.9.9" />
      <path d="M7 15.5a3 3 0 0 1-.3-6 3.8 3.8 0 0 1 7.2-1.2 2.8 2.8 0 0 1-.4 5.7 .6.6 0 0 1-.1 0H7z" />
    </>
  ),
  cloudRain: (
    <>
      <path d="M5.5 10.5a3.2 3.2 0 0 1-.3-6.4 4 4 0 0 1 7.7-1.3 3 3 0 0 1-.4 6.1 .6.6 0 0 1-.1 0h-6.9z" />
      <path d="M6 13.5l-1 2M9.5 13.5l-1 2M13 13.5l-1 2" />
    </>
  ),
  cloudSnow: (
    <>
      <path d="M5.5 10.5a3.2 3.2 0 0 1-.3-6.4 4 4 0 0 1 7.7-1.3 3 3 0 0 1-.4 6.1 .6.6 0 0 1-.1 0h-6.9z" />
      <path d="M6 14v2M9.5 14v2M13 14v2M5.3 15l1.4-1M8.8 15l1.4-1M12.3 15l1.4-1" />
    </>
  ),
  cloudLightning: (
    <>
      <path d="M5.5 10a3.2 3.2 0 0 1-.3-6.4 4 4 0 0 1 7.7-1.3 3 3 0 0 1-.4 6.1 .6.6 0 0 1-.1 0h-6.9z" />
      <path d="M9.5 11l-2 4h2.2l-1.4 3.5 3.7-5H10z" fill="currentColor" stroke="none" />
    </>
  ),
  fog: (
    <path d="M2 6h14M2 9h14M2 12h10" />
  ),
};

function iconFor(condition) {
  const c = (condition ?? '').toLowerCase();
  if (c.includes('thunder')) return ICONS.cloudLightning;
  if (c.includes('snow')) return ICONS.cloudSnow;
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return ICONS.cloudRain;
  if (c.includes('fog')) return ICONS.fog;
  if (c === 'overcast') return ICONS.cloud;
  if (c.includes('partly') || c.includes('mostly clear')) return ICONS.cloudSun;
  if (c.includes('clear')) return ICONS.sun;
  return ICONS.cloud;
}

export default function WeatherIcon({ condition, size = 18 }) {
  const icon = iconFor(condition);
  if (!icon) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 18 18"
      fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      style={{ verticalAlign: '-4px', marginRight: 3 }}
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}
